/**
 * 外部課題トラッカー（Backlog / Jira）クライアントの共通形。
 *
 * 各プロバイダ固有の課題表現を、移行先 Task に写しやすい「正規化済み課題」へ畳んで返す。
 * 状態/優先度は原文（プロバイダの表示名）をそのまま持ち、TaskStatus/TaskPriority への
 * 写像は取り込み側（TrackerImportService）で行う（マッピング規則を一箇所に集約するため）。
 */

/** 正規化済みコメント（取り込み時 TaskComment に写す）。 */
export interface NormalizedComment {
  /** 投稿者の表示名（解決できなければ null）。 */
  authorName: string | null;
  /** 本文（プレーンテキスト）。 */
  body: string;
  /** 作成日時（ISO8601 文字列。取得できなければ null）。 */
  createdAt: string | null;
}

/**
 * 正規化済み課題。プロバイダ非依存で Task へ写せる最小集合。
 *   - externalKey はプロバイダ内で一意な課題キー（Backlog: "IPLOT-12" / Jira: "ABC-34"）。
 *   - status / priority は原文（表示名）。enum 写像は取り込み側で行う。
 *   - parentExternalKey は親課題キー（あれば）。2 パスで parentId に解決する。
 */
export interface NormalizedIssue {
  externalKey: string;
  title: string;
  description: string | null;
  /** 状態の原文（例: "未対応" / "In Progress"）。 */
  status: string | null;
  /** 優先度の原文（例: "高" / "Medium"）。 */
  priority: string | null;
  assigneeName: string | null;
  startDate: string | null;
  dueDate: string | null;
  estimatedHours: number | null;
  actualHours: number | null;
  /** 親課題キー（subtask の親 / Backlog の親課題）。無ければ null。 */
  parentExternalKey: string | null;
  /**
   * 課題種別の原文（例: "Epic" / "Story" / "Sub-task" / "Bug" / "Task" / Backlog の「子課題」等）。
   * TaskIssueType への写像は取り込み側で行う。検出できなければ null。
   */
  issueType?: string | null;
  /**
   * Epic Link（このストーリー/タスクが属する Epic の外部キー）。
   * subtask の親（parentExternalKey）とは別系統で、2 パスで epicId に解決する。
   * 検出できなければ null。
   */
  epicExternalKey?: string | null;
  /** ストーリーポイント（見積もり）。検出できなければ null。 */
  storyPoints?: number | null;
  /** スプリント名（active / 最後のもの）。検出できなければ null。 */
  sprint?: string | null;
  /** コメント（取得した場合のみ。未取得は undefined）。 */
  comments?: NormalizedComment[];
}

/** test 接続の結果。 */
export interface TrackerTestResult {
  ok: boolean;
  /** 確認できたプロジェクト数や自分の表示名など、軽い診断情報。 */
  detail?: string;
  /** 失敗時のエラーメッセージ（秘匿情報は含めない）。 */
  error?: string;
}

/** ページング/差分取得のオプション。 */
export interface ListIssuesOptions {
  /** これ以降に更新された課題のみ（ISO8601 / Backlog は YYYY-MM-DD）。差分取込で使う。 */
  updatedSince?: string | null;
  /** 取得件数の上限（暴走防止の安全弁）。既定はクライアント側の定数。 */
  maxIssues?: number;
  /** コメントも取得するか（既定 false）。 */
  includeComments?: boolean;
}
