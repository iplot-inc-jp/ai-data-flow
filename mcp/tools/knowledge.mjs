/**
 * ナレッジグラフ バッチ取り込み（文書ファイル群 → Claude 抽出 → ナレッジグラフ）
 *
 * プロジェクトに溜まった文書ファイル群（アップロード済 Blob / 既存添付 / Drive）をバッチで読み、
 * Claude で実体・自動タグ・関係を抽出してナレッジグラフを自動生成する機能の MCP 露出。
 * 取り込みは2階層（IngestionBatch → IngestionFile）で、各ファイル単位の細かいステータス・
 * 試行回数・エラーを保持し、個別リトライ／再開できる（spec §7）。
 *
 * ── 4 ツール ──────────────────────────────────────────────────────────
 *   1) knowledge_ingest_start   バッチ作成（ソース＋ファイル指定 → 各ファイルにジョブ投入）
 *   2) knowledge_batch_status   バッチ詳細（files 込みの細かいステータス）をポーリング取得
 *   3) knowledge_file_retry     失敗ファイルの個別リトライ（ジョブ再投入。MERGE は冪等で安全）
 *   4) knowledge_graph_query    ナレッジグラフ取得（q 無し＝nodes/edges/documents 全体 /
 *                               q 有り＝ラベル/タイトル部分一致 search）
 *
 * curated 外の操作（resume/cancel/skip/設定・ノード編集など）は generic の api_request で:
 *   - POST   /ingestion-batches/:id/resume   バッチ再開（PENDING/FAILED/stale を再投入）
 *   - POST   /ingestion-batches/:id/cancel   バッチキャンセル
 *   - POST   /ingestion-files/:id/skip       ファイルを手動 SKIP
 *   - GET/PUT /projects/:projectId/knowledge/settings  課金ガード設定
 *   - GET    /knowledge-nodes/:id            ノード詳細（mentions 込み）
 *
 * 注意: ファイルの原本 bytes をアップロードする操作（multipart → Blob）は MCP では扱わない。
 *   UPLOAD ソースは事前に blobUrl を取得済みであること。素材を溜めるだけで Claude を呼ばない
 *   運用は options.aiExtractionEnabled=false で（課金ガード, spec §6）。
 */

import { z } from 'zod';
import { wrap } from '../lib/api.mjs';

const sourceFileSchema = z.object({
  sourceType: z
    .enum(['UPLOAD', 'ATTACHMENT', 'DRIVE'])
    .describe(
      'ソース種別。UPLOAD=アップロード済（blobUrl 必須） / ATTACHMENT=既存添付（sourceRef=attachmentId） / DRIVE=Google Drive（sourceRef=driveFileId）',
    ),
  filename: z.string().describe('ファイル名（拡張子で型判定に使われる）'),
  sourceRef: z
    .string()
    .optional()
    .describe('attachmentId / driveFileId。UPLOAD のときは不要'),
  displayName: z.string().optional().describe('表示名（任意）'),
  mimeType: z.string().optional().describe('MIME タイプ（例: application/pdf）'),
  size: z.number().int().optional().describe('サイズ（bytes, 任意）'),
  blobUrl: z
    .string()
    .optional()
    .describe('原本の Blob URL。UPLOAD ソースでは必須（事前アップロード済の URL）'),
});

export function registerTools(server, call) {
  server.tool(
    'knowledge_ingest_start',
    '文書ファイル群のバッチ取り込みを開始する（edit 権限）。' +
      'ソース＋ファイルを指定して IngestionBatch を作成し、各 IngestionFile に取り込みジョブ（KG_INGEST_FILE / ' +
      'ZIP は KG_EXPAND_ARCHIVE）を投入する。戻り値は files 込みのバッチ詳細（各ファイルの status を持つ）。' +
      '進捗は knowledge_batch_status でポーリングする。' +
      'ソース種別: UPLOAD（事前に blobUrl を取得済みのファイル）/ ATTACHMENT（既存添付。sourceRef=attachmentId）/ ' +
      'DRIVE（Google Drive。sourceRef=driveFileId）。' +
      'options でプロジェクトの課金ガード設定をバッチ単位に上書きできる（料金抑制）: ' +
      '{ aiExtractionEnabled?: boolean（Claude による抽出。false で素材だけ溜める）, ' +
      'ocrEnabled?: boolean（画像/スキャンPDF を vision で読む）, model?: string（抽出モデル） }。' +
      'POST /api/projects/:projectId/ingestion-batches。',
    {
      projectId: z.string().describe('取り込み先プロジェクトID'),
      files: z
        .array(sourceFileSchema)
        .min(1)
        .describe('取り込むファイル群（1件以上）。各ファイルは sourceType と filename が必須'),
      name: z
        .string()
        .optional()
        .describe('バッチ名（未指定なら「取り込み <件数>件」が補完される）'),
      options: z
        .record(z.unknown())
        .optional()
        .describe(
          'バッチ単位の抽出オプション（プロジェクト設定を上書き）。' +
            '{ aiExtractionEnabled?, ocrEnabled?, model?, imagingMode? } など。' +
            '未指定ならプロジェクトのナレッジ設定を継承する',
        ),
    },
    wrap(({ projectId, files, name, options }) =>
      call('POST', `/projects/${projectId}/ingestion-batches`, {
        body: {
          files,
          ...(name !== undefined ? { name } : {}),
          ...(options !== undefined ? { options } : {}),
        },
      }),
    ),
  );

  server.tool(
    'knowledge_batch_status',
    'バッチ取り込みの詳細状況を取得する（view 権限。ポーリング用）。' +
      'バッチの status（PENDING/EXPANDING/RUNNING/PARTIAL/SUCCEEDED/FAILED/CANCELLED）と件数カウンタ、' +
      'および各 IngestionFile の status（PENDING/FETCHING/EXPANDING/PREPROCESSING/EXTRACTING/MERGING/' +
      'SUCCEEDED/FAILED/SKIPPED）・step・progress・attempts・error・knowledgeDocumentId を返す。' +
      'FAILED のファイルは knowledge_file_retry で個別再投入できる（バッチごと再開は api_request の ' +
      'POST /ingestion-batches/:id/resume）。' +
      'GET /api/ingestion-batches/:id。',
    {
      batchId: z.string().describe('バッチID（knowledge_ingest_start の戻り id）'),
    },
    wrap(({ batchId }) => call('GET', `/ingestion-batches/${batchId}`)),
  );

  server.tool(
    'knowledge_file_retry',
    '失敗（または stale）した個別ファイルの取り込みを手動リトライする（edit 権限）。' +
      '当該ファイルの BackgroundJob を再投入する（FAILED→QUEUED、attempts は積み増し）。' +
      'グラフへの MERGE は冪等なので、同じファイルを再処理してもノード/エッジは重複しない。' +
      '戻り値は再投入後の IngestionFile。バッチ全体の未処理/失敗をまとめて再開したい場合は ' +
      'api_request で POST /ingestion-batches/:id/resume を使う。' +
      'POST /api/ingestion-files/:id/retry。',
    {
      fileId: z
        .string()
        .describe('取り込みファイルID（knowledge_batch_status の files[].id）'),
    },
    wrap(({ fileId }) => call('POST', `/ingestion-files/${fileId}/retry`, { body: {} })),
  );

  server.tool(
    'knowledge_graph_query',
    'ナレッジグラフを取得する（view 権限）。' +
      'q を省略すると全体（{ nodes, edges, documents }）を返す: nodes=タグ(TAG)/実体(ENTITY) のノード、' +
      'edges=ノード間の関係（KnowledgeRelation）、documents=取り込んだ文書ノード。' +
      'q を指定するとラベル/タイトルの部分一致 search 結果を返す。' +
      'ノードの mentions（出典文書＋snippet）詳細は api_request で GET /knowledge-nodes/:id。' +
      'q 無し → GET /api/projects/:projectId/knowledge/graph、' +
      'q 有り → GET /api/projects/:projectId/knowledge/search?q=。',
    {
      projectId: z.string().describe('プロジェクトID'),
      q: z
        .string()
        .optional()
        .describe('検索クエリ（ラベル/タイトル部分一致）。省略でグラフ全体を取得'),
    },
    wrap(({ projectId, q }) =>
      q !== undefined && q !== ''
        ? call('GET', `/projects/${projectId}/knowledge/search`, { query: { q } })
        : call('GET', `/projects/${projectId}/knowledge/graph`),
    ),
  );
}
