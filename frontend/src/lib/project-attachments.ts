// プロジェクト直下の汎用資料ファイル（Attachment, phaseId/taskId/informationTypeId/flowId 全て null）。
// fetch 作法・認証ヘッダーは flow-attachments.ts を踏襲する。

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5021';

/** プロジェクト直下に紐づく添付ファイル（背景・目的ページの関連資料など） */
export interface ProjectAttachment {
  id: string;
  projectId: string;
  kind: 'IMAGE' | 'PDF' | 'FILE';
  filename: string;
  /** 表示名（編集可能。null = filename を表示） */
  displayName: string | null;
  /** フォルダ分け（自由入力のフォルダ名。null = 未分類） */
  folder: string | null;
  mimeType: string;
  url: string;
  size: number;
  caption: string | null;
  order: number;
  createdAt: string;
}

function authHeader(): Record<string, string> {
  const h: Record<string, string> = {};
  const t = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  if (t) h['Authorization'] = `Bearer ${t}`;
  return h;
}

export const projectAttachmentApi = {
  /** GET /api/projects/:projectId/attachments */
  async list(projectId: string): Promise<ProjectAttachment[]> {
    const res = await fetch(`${API_URL}/api/projects/${projectId}/attachments`, {
      headers: authHeader(),
    });
    if (!res.ok) throw new Error('関連資料一覧の取得に失敗しました');
    return res.json();
  },

  /** POST /api/projects/:projectId/attachments （multipart, field 名 'file'） */
  async upload(projectId: string, file: File): Promise<ProjectAttachment> {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API_URL}/api/projects/${projectId}/attachments`, {
      method: 'POST',
      headers: authHeader(),
      body: form,
    });
    if (!res.ok) throw new Error('関連資料のアップロードに失敗しました');
    return res.json();
  },

  /** DELETE /api/attachments/:id */
  async remove(attachmentId: string): Promise<void> {
    const res = await fetch(`${API_URL}/api/attachments/${attachmentId}`, {
      method: 'DELETE',
      headers: authHeader(),
    });
    if (!res.ok) throw new Error('関連資料の削除に失敗しました');
  },

  /** 添付ファイル実体の配信 URL（認証不要） */
  fileUrl(attachmentId: string): string {
    return `${API_URL}/api/attachments/${attachmentId}/file`;
  },
};
