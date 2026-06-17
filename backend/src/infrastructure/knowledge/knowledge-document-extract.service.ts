import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../persistence/prisma/prisma.service';
import { ClaudeService } from '../services/claude.service';
import { CompanyKeyService } from '../services/company-key.service';
import { BlobStorageService } from '../services/blob-storage.service';
import { FileExtractionService, FileKind } from './file-extraction.service';
import { normalizeLabel } from '../../domain/value-objects/normalize-label.vo';

/**
 * 1件の添付ファイル（attachment）由来の KnowledgeDocument に対して、
 * オンデマンドで Claude 抽出を実行し、実体（entities）をナレッジグラフへマージするサービス。
 *
 * バッチ取り込み（KnowledgeIngestionService）とは独立した「今この文書だけ AI 抽出する」導線。
 * バッチと同じ部品（CompanyKeyService / ClaudeService.extractKnowledge / buildExtractInput 相当 /
 * normalizeLabel / 添付 bytes ロード）を再利用するが、状態機械やジョブ化は持たない軽量版。
 *
 * 課金ガード: ProjectKnowledgeSettings.aiExtractionEnabled が明示 false の場合は Claude を呼ばず
 * ゼロ件で早期 return する（gate-off）。API キー解決・bytes ロードよりも前に短絡する。
 */
@Injectable()
export class KnowledgeDocumentExtractService {
  private readonly logger = new Logger(KnowledgeDocumentExtractService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly claude: ClaudeService,
    private readonly companyKey: CompanyKeyService,
    private readonly blob: BlobStorageService,
    private readonly extraction: FileExtractionService,
  ) {}

  /**
   * documentId の添付を Claude で抽出し、実体ノード＋メンションをグラフへマージする。
   *
   * @returns 作成（upsert / createMany）した nodes / mentions の実数。スキップ時は理由付き。
   */
  async extract(
    documentId: string,
    userId: string,
  ): Promise<{
    created: { nodes: number; mentions: number };
    skipped?: 'NO_SOURCE' | 'AI_DISABLED';
  }> {
    // 1. 文書ロード。添付由来でなければ抽出対象が無い → NO_SOURCE。
    const doc = await this.prisma.knowledgeDocument.findUnique({
      where: { id: documentId },
    });
    if (!doc || doc.sourceType !== 'ATTACHMENT' || !doc.sourceRef) {
      return { created: { nodes: 0, mentions: 0 }, skipped: 'NO_SOURCE' };
    }
    const projectId = doc.projectId;

    // 2. 課金ガード（aiExtractionEnabled 既定 true）。明示 false なら Claude を呼ばず短絡。
    //    ※ API キー解決・bytes ロードよりも前に行う（コスト/外部 I/O を発生させない）。
    const settings = await this.prisma.projectKnowledgeSettings.findUnique({
      where: { projectId },
      select: { aiExtractionEnabled: true, defaultModel: true },
    });
    if (settings && settings.aiExtractionEnabled === false) {
      return { created: { nodes: 0, mentions: 0 }, skipped: 'AI_DISABLED' };
    }
    const model = settings?.defaultModel ?? null;

    // 3. API キー解決（会社設定→個人設定→環境変数）。無ければバッチ取り込みと同一メッセージで throw。
    const apiKey = await this.companyKey.resolveForProject(projectId, userId);
    if (!apiKey) {
      throw new Error(
        'Anthropic APIキーが未設定です（会社設定・個人設定・環境変数のいずれにも見つかりません）',
      );
    }

    // 4. 添付 bytes をロード（data → blobUrl(fetch) → disk のフォールバック）。
    const { bytes, mimeType, filename } = await this.loadAttachmentBytes(
      doc.sourceRef,
      projectId,
    );
    const kind = this.extraction.classify(
      mimeType ?? doc.mimeType,
      filename ?? doc.title,
    );

    // 5. Claude 入力を組み立てて抽出（PDF=document / 画像=image / それ以外=text）。
    const input = this.buildExtractInput(
      kind,
      bytes,
      null,
      filename ?? doc.title,
    );
    const extraction = await this.claude.extractKnowledge(input, apiKey, model ?? undefined, {
      projectId,
      area: 'KNOWLEDGE_EXTRACTION',
      userId,
    });

    // 6. マージ: 実体 → KnowledgeNode(type=ENTITY) を normalizedLabel で upsert、
    //    各ノードへ KnowledgeMention を createMany（skipDuplicates で冪等）。
    const entities = Array.isArray(extraction.entities)
      ? extraction.entities
      : [];

    const nodeIds: string[] = [];
    const seenKeys = new Set<string>();
    for (const entity of entities) {
      const label = typeof entity?.label === 'string' ? entity.label.trim() : '';
      if (!label) continue;
      const normalizedLabel = normalizeLabel(label);
      if (!normalizedLabel) continue;
      // 同一抽出内の重複ラベルは1回だけ upsert（同じ node に二重 mention を作らない）。
      if (seenKeys.has(normalizedLabel)) continue;
      seenKeys.add(normalizedLabel);

      const entityKind =
        typeof entity?.kind === 'string' && entity.kind.trim()
          ? entity.kind.trim()
          : null;
      const description =
        typeof entity?.description === 'string' && entity.description.trim()
          ? entity.description.trim()
          : null;

      const upserted = await this.prisma.knowledgeNode.upsert({
        where: {
          projectId_type_normalizedLabel: {
            projectId,
            type: 'ENTITY',
            normalizedLabel,
          },
        },
        create: {
          projectId,
          type: 'ENTITY',
          entityKind,
          label,
          normalizedLabel,
          description,
        },
        // 既存ノードは表記を尊重（label/description は上書きしない）。entityKind のみ未設定なら補完。
        update: entityKind ? { entityKind } : {},
        select: { id: true },
      });
      nodeIds.push(upserted.id);
    }

    let mentionsCreated = 0;
    if (nodeIds.length > 0) {
      const result = await this.prisma.knowledgeMention.createMany({
        data: nodeIds.map((nodeId) => ({
          projectId,
          documentId,
          nodeId,
        })),
        skipDuplicates: true,
      });
      mentionsCreated = result.count;

      // mentionCount を実 mention 数で再計算（バッチ取り込みと同じ可視化）。
      for (const nodeId of nodeIds) {
        const count = await this.prisma.knowledgeMention.count({
          where: { nodeId },
        });
        await this.prisma.knowledgeNode.update({
          where: { id: nodeId },
          data: { mentionCount: count },
        });
      }
    }

    return { created: { nodes: nodeIds.length, mentions: mentionsCreated } };
  }

  /**
   * 添付（Attachment）の bytes を取得する。data(DB) → blobUrl(fetch) → disk の順でフォールバック。
   * attachment.controller の serveFile と同じ優先順位（DB Bytes 最優先、client 直アップロードは Blob、
   * 旧ローカルはディスク）。projectId にスコープしてクロスプロジェクト流出を防ぐ。
   */
  private async loadAttachmentBytes(
    attachmentId: string,
    projectId: string,
  ): Promise<{ bytes: Buffer; mimeType: string | null; filename: string | null }> {
    const att = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, projectId },
      select: {
        data: true,
        blobUrl: true,
        url: true,
        mimeType: true,
        filename: true,
      },
    });
    if (!att) {
      throw new Error(
        `Attachment ${attachmentId} が見つかりません（プロジェクト不一致の可能性）`,
      );
    }
    // 1. DB Bytes（新方式）。
    if (att.data) {
      return {
        bytes: Buffer.from(att.data),
        mimeType: att.mimeType,
        filename: att.filename,
      };
    }
    // 2. client 直アップロード（Vercel Blob 公開 URL）。
    if (att.blobUrl) {
      const bytes = await this.blob.read(att.blobUrl);
      return { bytes, mimeType: att.mimeType, filename: att.filename };
    }
    // 3. 旧方式: ディスク参照（`/uploads/...` 配信パス → ディスク絶対パス）。
    const bytes = await this.blob.readUploadFile(
      this.attachmentDiskPath(att.url),
    );
    return { bytes, mimeType: att.mimeType, filename: att.filename };
  }

  /** Attachment の配信パス（/uploads/...）をディスク絶対パスへ（ingestion service と同一ロジック）。 */
  private attachmentDiskPath(url: string): string {
    const uploadDir = process.env.UPLOAD_DIR || `${process.cwd()}/uploads`;
    const name = url.replace(/^.*\/uploads\//, '').replace(/^\/+/, '');
    return `${uploadDir}/${name}`;
  }

  /**
   * ファイル種別に応じた Claude 入力（pdf/image/text）を組み立てる。
   * KnowledgeIngestionService.buildExtractInput と同一ロジック（private のため replicate）。
   */
  private buildExtractInput(
    kind: FileKind,
    bytes: Buffer,
    text: string | null,
    filename: string,
  ): {
    text?: string;
    pdfBase64?: string;
    images?: { base64: string; mimeType: string }[];
    filename: string;
  } {
    if (kind === 'pdf') {
      return { pdfBase64: bytes.toString('base64'), filename };
    }
    if (kind === 'image') {
      return {
        images: [{ base64: bytes.toString('base64'), mimeType: this.guessMime(filename) }],
        filename,
      };
    }
    return { text: text ?? '', filename };
  }

  /** 拡張子から画像 MIME を推定（image 入力の media_type 用）。 */
  private guessMime(filename: string): string {
    const ext = (/\.([a-z0-9]+)$/i.exec(filename || '')?.[1] || '').toLowerCase();
    switch (ext) {
      case 'png':
        return 'image/png';
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'webp':
        return 'image/webp';
      case 'gif':
        return 'image/gif';
      default:
        return 'application/octet-stream';
    }
  }
}
