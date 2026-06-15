'use client';

/**
 * 背景・目的ページ（旧プロジェクト憲章の後継）。
 *
 * - 背景 / 目的 / 成功基準 の3セクションを textarea + onBlur 自動保存で編集する。
 *   保存先は既存の憲章API（GET/PUT /projects/:projectId/charter の
 *   background / purpose / successCriteria。charterApi を流用）。
 * - 「関連資料」は共有 FileDropZone（全形式可）でプロジェクト直下の添付
 *   （POST /api/projects/:projectId/attachments）にアップロードし、
 *   画像はサムネイル・その他はファイル名リンクで一覧表示する（削除は confirm）。
 * - スコープ外（やらないこと）はGAP一覧の「スコープ外」トグルで管理する。
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  AlertCircle,
  Brain,
  FileText,
  Landmark,
  Loader2,
  Paperclip,
  Trash2,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { HowToPanel } from '@/components/ui/how-to-panel';
import { ManualButton } from '@/components/ui/manual-dialog';
import { useReadOnly } from '@/components/read-only-context';
import { EditGate } from '@/components/edit-gate';
import { ProjectBundleIo } from '@/components/io/ProjectBundleIo';
import { Card, CardContent } from '@/components/ui/card';
import { FileDropZone } from '@/components/ui/file-drop-zone';
import {
  charterApi,
  type ProjectCharter,
  type ProjectCharterInput,
} from '@/lib/pmbok';
import {
  projectAttachmentApi,
  type ProjectAttachment,
} from '@/lib/project-attachments';

// 文章セクションの定義（key は ProjectCharter のフィールド名と一致）。
const TEXT_SECTIONS: {
  key: 'background' | 'purpose' | 'successCriteria';
  label: string;
  placeholder: string;
}[] = [
  { key: 'background', label: '背景', placeholder: 'なぜこのプロジェクトを始めるのか（現状の課題・経緯）' },
  { key: 'purpose', label: '目的', placeholder: 'このプロジェクトで達成したいこと' },
  { key: 'successCriteria', label: '成功基準', placeholder: '何をもって成功とするか（測定可能な基準）' },
];

/** ファイルサイズの簡易表示（B / KB / MB） */
function formatBytes(size: number): string {
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)}KB`;
  return `${(size / (1024 * 1024)).toFixed(1)}MB`;
}

export default function BackgroundPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { canEdit } = useReadOnly();

  const [charter, setCharter] = useState<ProjectCharter | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 関連資料（プロジェクト直下の添付）
  const [attachments, setAttachments] = useState<ProjectAttachment[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(true);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [attachmentUploading, setAttachmentUploading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setAttachmentsLoading(true);
      setError(null);
      try {
        const ch = await charterApi.get(projectId);
        if (!cancelled) setCharter(ch);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '読み込みに失敗しました');
      } finally {
        if (!cancelled) setLoading(false);
      }
      try {
        const list = await projectAttachmentApi.list(projectId);
        if (!cancelled) setAttachments(list);
      } catch (e) {
        if (!cancelled) {
          setAttachmentError(
            e instanceof Error ? e.message : '関連資料の取得に失敗しました',
          );
        }
      } finally {
        if (!cancelled) setAttachmentsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // 1フィールドだけ PUT（upsert）し、レスポンスで state を更新する。
  const save = useCallback(
    async (patch: ProjectCharterInput) => {
      setSaving(true);
      setError(null);
      try {
        const next = await charterApi.upsert(projectId, patch);
        setCharter(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : '保存に失敗しました');
      } finally {
        setSaving(false);
      }
    },
    [projectId],
  );

  // 複数ファイルを逐次アップロード（失敗ファイル名はインライン表示）
  const uploadAttachments = useCallback(
    async (files: File[]) => {
      setAttachmentUploading(true);
      setAttachmentError(null);
      const failed: string[] = [];
      for (const file of files) {
        try {
          await projectAttachmentApi.upload(projectId, file);
        } catch {
          failed.push(file.name);
        }
      }
      try {
        const list = await projectAttachmentApi.list(projectId);
        setAttachments(list);
      } catch {
        // 一覧の再取得に失敗してもアップロード自体の結果表示は維持する
      }
      if (failed.length > 0) {
        setAttachmentError(`アップロードに失敗しました: ${failed.join('、')}`);
      }
      setAttachmentUploading(false);
    },
    [projectId],
  );

  const deleteAttachment = useCallback(async (attachment: ProjectAttachment) => {
    if (!window.confirm(`「${attachment.filename}」を削除しますか？`)) return;
    setAttachmentError(null);
    try {
      await projectAttachmentApi.remove(attachment.id);
      setAttachments((prev) => prev.filter((a) => a.id !== attachment.id));
    } catch (e) {
      setAttachmentError(e instanceof Error ? e.message : '削除に失敗しました');
    }
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Landmark className="h-5 w-5 text-primary" />
            背景・目的
          </span>
        }
        description="なぜやるのか（背景）・何を達成するのか（目的）・何をもって成功とするか（成功基準）を言語化します。"
        help="プロジェクトの存在理由を背景・目的・成功基準の3点で言語化し、企画書や現状資料などの関連資料を添付して関係者と共有します。スコープ外（やらないこと）はGAP一覧の「スコープ外」トグルで管理します。"
        backHref={`/dashboard/projects/${projectId}`}
        backLabel="プロジェクトへ戻る"
        actions={
          <div className="flex items-center gap-2">
            {saving && (
              <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                保存中…
              </span>
            )}
            <HowToPanel
              steps={[
                '「背景」に、なぜこのプロジェクトを始めるのか（現状の課題・経緯）を書きます。入力欄から離れると自動保存されます。',
                '「目的」に、このプロジェクトで達成したいことを書きます。',
                '「成功基準」に、何をもって成功とするかを測定可能な形で書きます。',
                '「関連資料」に企画書・現状資料などのファイルをドラッグ＆ドロップで添付します（全形式・複数可）。画像はサムネイル、その他はファイル名リンクで表示されます。',
                'スコープ外（やらないこと）はGAP一覧の「スコープ外」トグルで管理します。',
              ]}
            />
            <ManualButton feature="charter" />
            <ProjectBundleIo
              projectId={projectId}
              canEdit={canEdit}
              onDone={() => {
                if (typeof window !== 'undefined') window.location.reload();
              }}
            />
          </div>
        }
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex h-[200px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <EditGate dim={false}>
          {/* 文章セクション（textarea + onBlur 保存） */}
          <div className="grid gap-4 lg:grid-cols-3">
            {TEXT_SECTIONS.map((section) => (
              <BackgroundTextSection
                key={section.key}
                label={section.label}
                placeholder={section.placeholder}
                value={charter?.[section.key] ?? ''}
                onSave={(v) => void save({ [section.key]: v === '' ? null : v })}
              />
            ))}
          </div>

          {/* 関連資料（プロジェクト直下の添付。アップロード即保存） */}
          <Card className="bg-white border-gray-200">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold text-[#050f3e]">
                  <Paperclip className="h-4 w-4 text-primary" />
                  関連資料
                </h2>
                <span className="text-xs text-gray-400">
                  企画書・現状資料など（全形式・複数可）
                </span>
              </div>

              {/* ナレッジと共通の資料プールである旨の明示＋取り込みページ導線 */}
              <p className="flex flex-wrap items-center gap-1 text-xs text-gray-500">
                <Brain className="h-3.5 w-3.5 shrink-0 text-primary" />
                ここの資料は<span className="font-medium text-[#050f3e]">ナレッジの取り込み元</span>と共通です。各資料の
                <Brain className="inline h-3 w-3" />
                ボタン、または
                <Link
                  href={`/dashboard/projects/${projectId}/knowledge/ingestion`}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  ナレッジ取り込み
                </Link>
                からナレッジ化できます。
              </p>

              {/* ドラッグ&ドロップ（クリックでファイル選択も可）。複数可・逐次アップロード */}
              <FileDropZone
                onFiles={(files) => void uploadAttachments(files)}
                busy={attachmentUploading}
                className="py-3"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Paperclip className="h-3.5 w-3.5 text-gray-400" />
                  ファイルをドラッグ＆ドロップ、またはクリックして選択
                </span>
              </FileDropZone>

              {attachmentError && (
                <p className="flex items-center gap-1 text-xs text-red-600">
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  {attachmentError}
                </p>
              )}

              {attachmentsLoading ? (
                <div className="flex items-center gap-2 py-2 text-xs text-gray-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  読み込み中…
                </div>
              ) : attachments.length === 0 ? (
                <p className="py-1 text-xs text-gray-400">関連資料はまだありません。</p>
              ) : (
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {attachments.map((a) => {
                    const isImage = a.kind === 'IMAGE' || a.mimeType.startsWith('image/');
                    return (
                      <li key={a.id} className="rounded border border-gray-200 bg-white p-1.5">
                        <a
                          href={projectAttachmentApi.fileUrl(a.id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block"
                          title={a.filename}
                        >
                          {isImage ? (
                            // 画像はサムネイル表示（クリックで原寸を別タブ表示）
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={projectAttachmentApi.fileUrl(a.id)}
                              alt={a.filename}
                              className="h-24 w-full rounded bg-gray-100 object-cover"
                            />
                          ) : (
                            // PDF 等はファイル名リンク
                            <span className="flex h-24 w-full flex-col items-center justify-center gap-1 rounded bg-gray-50 px-2 text-center">
                              <FileText className="h-6 w-6 text-gray-400" />
                              <span className="line-clamp-2 break-all text-[11px] text-blue-600 underline">
                                {a.filename}
                              </span>
                            </span>
                          )}
                        </a>
                        <div className="mt-1 flex items-center justify-between gap-1">
                          <span
                            className="min-w-0 flex-1 truncate text-[11px] text-gray-500"
                            title={a.filename}
                          >
                            {a.filename}
                          </span>
                          <span className="shrink-0 text-[10px] text-gray-400">
                            {formatBytes(a.size)}
                          </span>
                          <Link
                            href={`/dashboard/projects/${projectId}/knowledge/ingestion?attach=${a.id}`}
                            className="shrink-0 rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-primary"
                            title="この資料をナレッジに取り込む"
                            aria-label={`${a.filename} をナレッジに取り込む`}
                          >
                            <Brain className="h-3.5 w-3.5" />
                          </Link>
                          <button
                            type="button"
                            onClick={() => void deleteAttachment(a)}
                            className="shrink-0 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                            title="削除"
                            aria-label={`${a.filename} を削除`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* スコープ外の導線（GAP一覧で管理） */}
          <p className="text-xs text-gray-400">
            スコープ外（このプロジェクトでやらないこと）は
            <Link
              href={`/dashboard/projects/${projectId}/gap-items`}
              className="mx-1 text-primary underline-offset-2 hover:underline"
            >
              GAP一覧
            </Link>
            の「スコープ外」トグルで管理します。
          </p>
        </EditGate>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 文章セクション（textarea + onBlur 保存）
// ---------------------------------------------------------------------------

function BackgroundTextSection({
  label,
  placeholder,
  value,
  onSave,
}: {
  label: string;
  placeholder: string;
  value: string;
  onSave: (value: string) => void;
}) {
  // ローカルドラフトで保持し、onBlur で差分があるときだけ保存する。
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <Card className="bg-white border-gray-200">
      <CardContent className="space-y-2 p-4">
        <label className="block text-sm font-semibold text-[#050f3e]">{label}</label>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v !== value.trim()) onSave(v);
          }}
          rows={6}
          placeholder={placeholder}
          className="w-full resize-y rounded-md border border-gray-200 px-2.5 py-2 text-sm text-gray-800 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </CardContent>
    </Card>
  );
}
