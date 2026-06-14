/**
 * 機能(section)単位の export / import（ProjectBundleService の SECTIONS を機能粒度で露出）
 *
 * プロジェクト全体 export/import（project_export / project_import）が「全 section の合成」
 * なのに対し、本ツール群は **1 機能(section)だけ** を個別に出し入れする。両者は同じ
 * SECTIONS 定義・内部機械を共有するため、同一プロジェクト内なら round-trip（export→import）で
 * 同じ構造を再現できる（feature_export → 編集 → feature_import で書き戻し）。
 *
 * ── 3 系統の住み分け（重複させないこと）──────────────────────────────
 *   1) project_export / project_import（#9・project_bundle.mjs）
 *        = プロジェクト全体 = 全 section の合成バンドル。丸ごと複製/テンプレ展開はこちら。
 *   2) feature_*（本ファイル）
 *        = 機能(section)単位。flatter な機能（gap/tasks/risks/stakeholders/kpi/
 *          masters(domains/informationTypes/systems/constraints/roles/meetings)/
 *          data-objects(object-map)/requirements/tobe/cruoa/analysis/adoption(stakeholderTracking)/
 *          charter 等、sections[] にある機能）を 1 つだけ出し入れする。
 *   3) entity_json（#15・entity_json.mjs）の *_json
 *        = グラフ構造（業務フロー / DFD / イシューツリー）。ノード/エッジの構造を
 *          self-contained localId bundle で扱う。flows/dfd/issues/cruoa/flowLinks の
 *          「構造」は section 露出ではなく **必ず entity_json 側** を使う
 *          （feature_sections_list の graphEntityNote が住み分けを示す）。
 *
 * ── AI 自走手順（推奨）────────────────────────────────────────────────
 *   1. feature_sections_list({projectId}) … 利用可能な機能(section)と依存先(dependsOnKeys)・
 *      graph 系の住み分け note を把握する。
 *   2. feature_sections_schema()           … 各 section の rows ペイロード形式（JSON Schema）を把握する。
 *   3. feature_export({projectId, section}) … その機能を { formatVersion, section, rows } で取得する。
 *   4. （rows をローカルで編集する）
 *   5. feature_import({projectId, section, rows, mode}) … 取り込む（merge=追加 / replace=その section の対象モデルのみ置換）。
 *
 * import 時の FK 解決:
 *   - section 内モデル間 FK・自己参照は呼び出しローカルの idMap で旧→新解決。
 *   - 依存先 section（dependsOnKeys）への FK は **既存DB の id** で解決する
 *     （同一DB round-trip なら一致。存在しなければ optional は null、required は skip）。
 */

import { z } from 'zod';
import { wrap } from '../lib/api.mjs';

const importModeSchema = z
  .enum(['merge', 'replace'])
  .describe(
    '取り込みモード。merge=既存データを残して追加（既定） / replace=この section の対象モデルのみ全消ししてから再構築（他 section には触れない）',
  );

const rowsSchema = z
  .record(z.array(z.record(z.unknown())))
  .describe(
    'model 名 -> Row[] のマップ（feature_export の rows と同形）。' +
      '各 Row は元の DB "id" を保持する（import 時の FK 旧→新解決に使う）。' +
      '形式は feature_sections_schema を参照。',
  );

export function registerTools(server, call) {
  server.tool(
    'feature_sections_list',
    '利用可能な機能(section)一覧を取得する（view 権限）。' +
      '各 section の key / 含まれる Prisma models / 取り込み前に存在している必要がある依存先 section（dependsOnKeys）、' +
      'および graph 系（flows/dfd/issues/cruoa/flowLinks）の住み分け note（graphEntityNote）を返す。' +
      'graph 系の「構造」は本ツールではなく entity_json（*_json）を使うこと。' +
      'GET /api/projects/:projectId/feature-sections。',
    {
      projectId: z.string().describe('対象プロジェクトID'),
    },
    wrap(({ projectId }) =>
      call('GET', `/projects/${projectId}/feature-sections`),
    ),
  );

  server.tool(
    'feature_sections_schema',
    '全機能(section)の rows ペイロードの機械可読 JSON Schema（draft-07）を取得する。' +
      '各 section ごとに { formatVersion?, section?, rows: { <model>: Row[] } } の形式と、' +
      'graph 系の住み分け note を含む。AI はまずこれで形式を把握してから ' +
      'feature_export → 編集 → feature_import の順で書き戻すとよい。認証不要の公開エンドポイント。' +
      'GET /api/feature-sections/schema。',
    {},
    wrap(() => call('GET', '/feature-sections/schema')),
  );

  server.tool(
    'feature_export',
    '1 機能(section)だけをエクスポートする（view 権限）。' +
      '戻り値は { formatVersion, section, rows: { <model>: Row[] } }。各 Row は元の DB "id" を保持する。' +
      'プロジェクト全体（全 section 合成）が欲しい場合は project_export を、' +
      '業務フロー/DFD/イシューツリーの「構造」が欲しい場合は entity_json（*_get_json）を使うこと。' +
      'GET /api/projects/:projectId/feature-sections/:key/export。',
    {
      projectId: z.string().describe('エクスポート対象プロジェクトID'),
      section: z
        .string()
        .describe(
          'section キー（feature_sections_list の key。例: tasks/risks/gaps/kpis/masterData/dataObjects/requirements/tobe/charter 等）',
        ),
    },
    wrap(({ projectId, section }) =>
      call('GET', `/projects/${projectId}/feature-sections/${section}/export`),
    ),
  );

  server.tool(
    'feature_import',
    'このプロジェクトへ1 機能(section)だけを取り込む（edit 権限）。' +
      'mode=merge（既定）は既存を残して追加（@@unique 衝突は get-or-create / skip）、' +
      'mode=replace はこの section の対象モデルのみ逆順で全消ししてから再構築する（他 section には触れない）。' +
      'rows は feature_export の rows（{ <model>: Row[] }）を編集したものを渡す（形式は feature_sections_schema 参照）。' +
      '依存先 section への FK は既存DB の id で解決される（同一DB round-trip なら一致）。' +
      '取り込んだモデルごとの件数サマリと warnings を返す。' +
      'POST /api/projects/:projectId/feature-sections/:key/import。',
    {
      projectId: z.string().describe('取り込み先プロジェクトID'),
      section: z.string().describe('section キー（feature_sections_list の key）'),
      rows: rowsSchema,
      mode: importModeSchema.optional(),
    },
    wrap(({ projectId, section, rows, mode }) =>
      call('POST', `/projects/${projectId}/feature-sections/${section}/import`, {
        body: mode === undefined ? { rows } : { rows, mode },
      }),
    ),
  );
}
