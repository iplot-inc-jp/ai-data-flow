/**
 * エンティティ自己完結 JSON I/O（業務フロー / DFD / イシューツリー）
 *
 * 1 つの「業務フロー / DFD / イシューツリー」を、自己完結した Bundle JSON として
 * get → 編集 → upsert（作成 or 丸ごと置換）するための curated ツール群。
 * LLM 生成は含まない（JSON の入出力のみ）。
 *
 * ── AI 自走手順（推奨）────────────────────────────────────────────────
 *   1. entity_json_schema() で flow / dfd / issueTree の JSON Schema（形式）を把握する。
 *   2. *_get_json(...) で対象エンティティを Bundle JSON として取得する。
 *   3. その Bundle を編集する（ノード/エッジ/ノード/フロー/ノード階層など）。
 *   4. *_replace_json(...)（既存の丸ごと置換）/ *_create_json(...)（新規作成）で書き戻す。
 *      → 返り値は保存後に再 get した最新 Bundle。
 *
 * Bundle 設計の要点:
 *   - 内部参照は localId（同梱配列内ローカル ID）で表す。get では DB id をそのまま
 *     localId に流用するので、get→編集→replace のラウンドトリップが自然に成立する。
 *   - role / informationType / dataObject はすべて「名前」で参照する
 *     （プロジェクトスコープで get-or-create。空名は未設定）。
 *   - replace/create は対象の子要素を丸ごと作り直す（部分更新ではない）。
 *   - version は必須。entity_json_schema の version と一致させること。
 *
 * Bundle 全体（bundle 引数）は z.record(z.unknown()) で緩く受け、形式検証は
 * バックエンド（EntityJsonService）に委譲する（version 不一致等はそこで弾かれる）。
 */

import { z } from 'zod';
import { wrap } from '../lib/api.mjs';

/** Bundle JSON 本体（self-contained）。形式検証は backend に委譲するため緩く受ける。 */
const bundleSchema = z
  .record(z.unknown())
  .describe(
    '自己完結 Bundle JSON 全体。形式は entity_json_schema で取得すること（version 必須）。' +
      '通常は *_get_json の戻りを編集したものをそのまま渡す。',
  );

export function registerTools(server, call) {
  // =========================================================================
  // スキーマ（最初に呼ぶ）
  // =========================================================================

  server.tool(
    'entity_json_schema',
    'flow / dfd / issueTree の自己完結 Bundle JSON の機械可読 JSON Schema（draft-07）を取得する。' +
      'AI はまずこれで形式を把握 → *_get_json で取得 → 編集 → *_replace_json / *_create_json で書き戻す。' +
      '認証不要の公開エンドポイント（GET /api/entity-json/schema）。',
    {},
    wrap(() => call('GET', '/entity-json/schema')),
  );

  // =========================================================================
  // 業務フロー（FlowBundle）
  // =========================================================================

  server.tool(
    'flow_get_json',
    '業務フローを自己完結 Bundle JSON（FlowBundle）で取得する。nodes/edges/業務定義/注釈/' +
      'ノード入出力リンクを同梱。role / informationType は名前参照。編集して flow_replace_json で書き戻せる。',
    {
      flowId: z.string().describe('業務フローID'),
    },
    wrap(({ flowId }) => call('GET', `/business-flows/${flowId}/json`)),
  );

  server.tool(
    'flow_replace_json',
    '既存業務フローの中身を FlowBundle で丸ごと置換する（nodes/edges/業務定義/注釈/入出力リンクを全置換、' +
      'flow メタ name/kind 等も更新）。bundle は flow_get_json の戻りを編集したものを渡す。' +
      '返り値は保存後に再取得した最新 Bundle。' +
      '【警告】nodes/edges は削除→再作成されるため、Bundle に含まれない付随データは巻き添えで失われる:' +
      ' IF定義（インターフェース定義）とそのカラム・矢印↔API紐づけ・クロスフロー入出力リンク(FlowNodeLink)は削除、' +
      ' CRUDマッピング/GAPのASIS/TOBEノード参照/第2レベルDFDのFUNCTION参照は null 化される。' +
      ' childFlowId（ドリルダウン子フロー）は保持されるので get の値をそのまま往復させること。' +
      ' これらの紐づけがある場合、小さな編集目的での安易な get→PUT は避け、個別のノード/エッジ操作ツールを使うこと。',
    {
      flowId: z.string().describe('置換対象の業務フローID'),
      bundle: bundleSchema,
    },
    wrap(({ flowId, bundle }) =>
      call('PUT', `/business-flows/${flowId}/json`, { body: bundle }),
    ),
  );

  server.tool(
    'flow_create_json',
    '業務フローを FlowBundle から新規作成する。bundle は entity_json_schema の flow 形式に従う' +
      '（version 必須、flow.name 必須。localId は同梱配列内でユニークな任意文字列で可、保存時に新 uuid へ再採番）。' +
      '返り値は作成後に取得した最新 Bundle。',
    {
      projectId: z.string().describe('作成先プロジェクトID'),
      bundle: bundleSchema,
    },
    wrap(({ projectId, bundle }) =>
      call('POST', `/projects/${projectId}/flows/json`, { body: bundle }),
    ),
  );

  // =========================================================================
  // DFD（DfdBundle）
  // =========================================================================

  server.tool(
    'dfd_get_json',
    'DFD を自己完結 Bundle JSON（DfdBundle）で取得する（get-or-create。無ければ空の図を作って返す）。' +
      'level=2（業務フロー単位の第2レベル）は flowId を、level=1（プロジェクト全体の第1レベル）は projectId を指定する。' +
      'flowId と projectId はどちらか一方を必ず渡すこと。',
    {
      flowId: z
        .string()
        .optional()
        .describe('第2レベル DFD（業務フロー単位）の対象フローID。第1レベルなら省略。'),
      projectId: z
        .string()
        .optional()
        .describe('第1レベル DFD（プロジェクト全体）の対象プロジェクトID。第2レベルなら省略。'),
      level: z
        .union([z.literal(1), z.literal(2)])
        .optional()
        .describe('参考用（1=第1レベル/projectId, 2=第2レベル/flowId）。実際の分岐は flowId/projectId の有無で決まる。'),
    },
    wrap(({ flowId, projectId }) => {
      if (flowId) return call('GET', `/business-flows/${flowId}/dfd/json`);
      if (projectId) return call('GET', `/projects/${projectId}/dfd/json`);
      throw new Error('flowId（第2レベル）または projectId（第1レベル）のいずれかが必要です。');
    }),
  );

  server.tool(
    'dfd_replace_json',
    'DFD を DfdBundle で丸ごと置換する（図配下の nodes/flows を全置換）。' +
      'level=2 は flowId、level=1 は projectId を指定（どちらか一方）。bundle は dfd_get_json の戻りを編集したものを渡す。' +
      '注意: 手動・自動生成を区別しないため、この置換は図全体を「Bundle が唯一の正」として上書きする。' +
      '返り値は保存後に再取得した最新 Bundle。',
    {
      flowId: z.string().optional().describe('第2レベル DFD の対象フローID。第1レベルなら省略。'),
      projectId: z
        .string()
        .optional()
        .describe('第1レベル DFD の対象プロジェクトID。第2レベルなら省略。'),
      level: z
        .union([z.literal(1), z.literal(2)])
        .optional()
        .describe('参考用。実際の分岐は flowId/projectId の有無で決まる。'),
      bundle: bundleSchema,
    },
    wrap(({ flowId, projectId, bundle }) => {
      if (flowId) return call('PUT', `/business-flows/${flowId}/dfd/json`, { body: bundle });
      if (projectId) return call('PUT', `/projects/${projectId}/dfd/json`, { body: bundle });
      throw new Error('flowId（第2レベル）または projectId（第1レベル）のいずれかが必要です。');
    }),
  );

  // =========================================================================
  // イシューツリー（IssueTreeBundle）
  // =========================================================================

  server.tool(
    'issue_tree_get_json',
    'イシューツリーを自己完結 Bundle JSON（IssueTreeBundle）で取得する。ノード階層は parentLocalId で表現、' +
      'rootCauseLocalId で根本原因ノード（同一ツリー内の localId、または他ツリーの確定ノードの実 DB id）を参照。' +
      'クロスツリー参照は書き戻し時もそのまま保持される。編集して issue_tree_replace_json で書き戻せる。',
    {
      treeId: z.string().describe('イシューツリーID'),
    },
    wrap(({ treeId }) => call('GET', `/issue-trees/${treeId}/json`)),
  );

  server.tool(
    'issue_tree_replace_json',
    '既存イシューツリーのノードを IssueTreeBundle で丸ごと置換する（tree メタも更新）。' +
      'depth は親子関係から自動導出される。bundle は issue_tree_get_json の戻りを編集したものを渡す。' +
      '返り値は保存後に再取得した最新 Bundle。',
    {
      treeId: z.string().describe('置換対象のイシューツリーID'),
      bundle: bundleSchema,
    },
    wrap(({ treeId, bundle }) =>
      call('PUT', `/issue-trees/${treeId}/json`, { body: bundle }),
    ),
  );

  server.tool(
    'issue_tree_create_json',
    'イシューツリーを IssueTreeBundle から新規作成する。bundle は entity_json_schema の issueTree 形式に従う' +
      '（version 必須、tree.name 必須。parentLocalId/rootCauseLocalId は同梱 localId で参照）。' +
      '返り値は作成後に取得した最新 Bundle。',
    {
      projectId: z.string().describe('作成先プロジェクトID'),
      bundle: bundleSchema,
    },
    wrap(({ projectId, bundle }) =>
      call('POST', `/projects/${projectId}/issue-trees/json`, { body: bundle }),
    ),
  );
}
