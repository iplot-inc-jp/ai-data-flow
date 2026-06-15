// 各機能の export / import（JSON 入出力）のための薄い fetch ラッパ。
//
// バックエンドは既に実装済み（本ファイルは UI から叩くための薄いクライアント）：
//   - プロジェクト全体: GET /projects/:id/export, POST /projects/:id/import {bundle, mode?},
//                       POST /organizations/:orgId/projects/import {bundle, name?, mode?}
//   - 機能単位(section): GET /projects/:id/feature-sections,
//                       GET /projects/:id/feature-sections/:key/export,
//                       POST /projects/:id/feature-sections/:key/import {rows, mode?}
//   - グラフ(entity-json): GET/PUT /business-flows/:id/json, POST /projects/:id/flows/json,
//                       DFD /business-flows/:flowId/dfd/json・/projects/:id/dfd/json,
//                       issue-trees/:id/json・/projects/:id/issue-trees/json
//
// 認可: localStorage の accessToken を Bearer で付与（既存 api.ts / flow-definition.ts と同慣習）。

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5021';

export type ImportMode = 'replace' | 'merge';

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const t =
    typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  if (t) h['Authorization'] = `Bearer ${t}`;
  return h;
}

async function getJson<T>(path: string, errMsg: string): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, { headers: headers() });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.message || errMsg);
  }
  return res.json();
}

async function sendJson<T>(
  method: 'POST' | 'PUT',
  path: string,
  body: unknown,
  errMsg: string,
): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    method,
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.message || errMsg);
  }
  return res.json();
}

// ===========================================================================
// プロジェクト全体バンドル
// ===========================================================================

/** プロジェクト全体のバンドル JSON。中身の形は問わず（そのままファイル化／取込）。 */
export type ProjectBundle = Record<string, unknown> & {
  project?: { name?: string; slug?: string; description?: string };
  exportedAt?: string;
};

export const projectBundleIo = {
  /** GET /projects/:id/export → バンドル JSON。 */
  export(projectId: string): Promise<ProjectBundle> {
    return getJson<ProjectBundle>(
      `/projects/${projectId}/export`,
      'プロジェクトのエクスポートに失敗しました',
    );
  },
  /** POST /projects/:id/import {bundle, mode} → section ごとの件数サマリ。 */
  import(
    projectId: string,
    bundle: ProjectBundle,
    mode: ImportMode,
  ): Promise<unknown> {
    return sendJson(
      'POST',
      `/projects/${projectId}/import`,
      { bundle, mode },
      'プロジェクトのインポートに失敗しました',
    );
  },
  /** POST /organizations/:orgId/projects/import {bundle, name?, mode?} → 新規プロジェクトを作成して取込。 */
  importAsNew(
    organizationId: string,
    bundle: ProjectBundle,
    name?: string,
    mode: ImportMode = 'merge',
  ): Promise<{ project: { id: string; name: string }; import: unknown }> {
    return sendJson(
      'POST',
      `/organizations/${organizationId}/projects/import`,
      { bundle, name, mode },
      '新規プロジェクトとしての取込に失敗しました',
    );
  },
};

// ===========================================================================
// 機能単位（feature-io / section）
// ===========================================================================

/** GET /projects/:id/feature-sections の 1 要素。 */
export interface SectionDescriptor {
  key: string;
  models: string[];
  dependsOnKeys: string[];
  graphEntityNote?: string;
}

/** GET /projects/:id/feature-sections/:key/export の戻り値。 */
export interface SectionExport {
  formatVersion: number;
  section: string;
  rows: Record<string, Array<Record<string, unknown>>>;
}

export const featureIo = {
  /** GET /projects/:id/feature-sections → 利用可能な section の一覧。 */
  listSections(projectId: string): Promise<SectionDescriptor[]> {
    return getJson<SectionDescriptor[]>(
      `/projects/${projectId}/feature-sections`,
      '機能一覧の取得に失敗しました',
    );
  },
  /** GET /projects/:id/feature-sections/:key/export → { formatVersion, section, rows }。 */
  exportSection(projectId: string, key: string): Promise<SectionExport> {
    return getJson<SectionExport>(
      `/projects/${projectId}/feature-sections/${key}/export`,
      'この機能のエクスポートに失敗しました',
    );
  },
  /**
   * POST /projects/:id/feature-sections/:key/import {rows, mode}。
   * 取り込むのは export の `rows`（model -> Row[]）。export JSON 全体を渡しても
   * `rows` を取り出して送る（formatVersion は backend が任意で検証）。
   */
  importSection(
    projectId: string,
    key: string,
    parsed: SectionExport | { rows: SectionExport['rows'] },
    mode: ImportMode,
  ): Promise<unknown> {
    const rows = (parsed as SectionExport).rows;
    if (!rows || typeof rows !== 'object') {
      throw new Error(
        'JSON の形式が不正です（{ rows: {...} } 形式の機能エクスポートを選択してください）',
      );
    }
    return sendJson(
      'POST',
      `/projects/${projectId}/feature-sections/${key}/import`,
      { rows, mode },
      'この機能のインポートに失敗しました',
    );
  },
};

// ===========================================================================
// グラフ系（entity-json: 業務フロー / DFD / イシューツリー）
// ===========================================================================

export type EntityBundle = Record<string, unknown>;

export const entityJsonIo = {
  // ---- 業務フロー ----
  /** GET /business-flows/:id/json → FlowBundle。 */
  exportFlow(flowId: string): Promise<EntityBundle> {
    return getJson<EntityBundle>(
      `/business-flows/${flowId}/json`,
      '業務フローのエクスポートに失敗しました',
    );
  },
  /** PUT /business-flows/:id/json → この業務フローの中身を丸ごと置換。 */
  importFlow(flowId: string, bundle: EntityBundle): Promise<EntityBundle> {
    return sendJson(
      'PUT',
      `/business-flows/${flowId}/json`,
      bundle,
      '業務フローのインポートに失敗しました',
    );
  },
  /** POST /projects/:id/flows/json → FlowBundle から新規業務フロー作成。 */
  createFlow(projectId: string, bundle: EntityBundle): Promise<EntityBundle> {
    return sendJson(
      'POST',
      `/projects/${projectId}/flows/json`,
      bundle,
      '業務フローの新規取込に失敗しました',
    );
  },

  // ---- DFD（第2レベル=flow配下 / 第1レベル=project直下） ----
  /** GET /business-flows/:flowId/dfd/json → DfdBundle（第2レベル）。 */
  exportFlowDfd(flowId: string): Promise<EntityBundle> {
    return getJson<EntityBundle>(
      `/business-flows/${flowId}/dfd/json`,
      'DFD のエクスポートに失敗しました',
    );
  },
  /** PUT /business-flows/:flowId/dfd/json → 第2レベル DFD を丸ごと置換。 */
  importFlowDfd(flowId: string, bundle: EntityBundle): Promise<EntityBundle> {
    return sendJson(
      'PUT',
      `/business-flows/${flowId}/dfd/json`,
      bundle,
      'DFD のインポートに失敗しました',
    );
  },
  /** GET /projects/:id/dfd/json → DfdBundle（第1レベル）。 */
  exportProjectDfd(projectId: string): Promise<EntityBundle> {
    return getJson<EntityBundle>(
      `/projects/${projectId}/dfd/json`,
      'DFD のエクスポートに失敗しました',
    );
  },
  /** PUT /projects/:id/dfd/json → 第1レベル DFD を丸ごと置換。 */
  importProjectDfd(
    projectId: string,
    bundle: EntityBundle,
  ): Promise<EntityBundle> {
    return sendJson(
      'PUT',
      `/projects/${projectId}/dfd/json`,
      bundle,
      'DFD のインポートに失敗しました',
    );
  },

  // ---- イシューツリー ----
  /** GET /issue-trees/:id/json → IssueTreeBundle。 */
  exportIssueTree(treeId: string): Promise<EntityBundle> {
    return getJson<EntityBundle>(
      `/issue-trees/${treeId}/json`,
      'イシューツリーのエクスポートに失敗しました',
    );
  },
  /** PUT /issue-trees/:id/json → ノードを丸ごと置換。 */
  importIssueTree(treeId: string, bundle: EntityBundle): Promise<EntityBundle> {
    return sendJson(
      'PUT',
      `/issue-trees/${treeId}/json`,
      bundle,
      'イシューツリーのインポートに失敗しました',
    );
  },
  /** POST /projects/:id/issue-trees/json → IssueTreeBundle から新規作成。 */
  createIssueTree(
    projectId: string,
    bundle: EntityBundle,
  ): Promise<EntityBundle> {
    return sendJson(
      'POST',
      `/projects/${projectId}/issue-trees/json`,
      bundle,
      'イシューツリーの新規取込に失敗しました',
    );
  },
};

// ===========================================================================
// クライアント側ユーティリティ（ファイルのダウンロード / 読み込み）
// ===========================================================================

/** ファイル名に使えない文字を置換し、適度な長さに丸める。 */
function safeFileName(name: string): string {
  return (name || 'export')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80);
}

/** 日時サフィックス（YYYYMMDD-HHMMSS）。 */
function timestamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

/**
 * 任意の JSON をブラウザでファイルダウンロードさせる。
 * ファイル名は `<baseName>-<YYYYMMDD-HHMMSS>.json`。
 */
export function downloadJson(data: unknown, baseName: string): void {
  if (typeof window === 'undefined') return;
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeFileName(baseName)}-${timestamp()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 次のティックで revoke（一部ブラウザで即時 revoke するとDLが失敗する）。
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** File を読み込んで JSON にパースする。失敗時は分かりやすい Error を投げる。 */
export async function readJsonFile<T = unknown>(file: File): Promise<T> {
  const text = await file.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('ファイルが正しい JSON ではありません');
  }
}
