'use client';

/**
 * ReportTypeRegistry — 帳票種別レジストリ。
 *
 * プロジェクトの帳票種別を CRUD し、各種別に具体帳票ファイルを
 * アップロード / ダウンロード / 削除する。DFD のデータフローは
 * reportTypeId でこの種別を参照する（DfdCanvas / DataFlowTable）。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FileText,
  Plus,
  Trash2,
  Upload,
  Download,
  Loader2,
  Pencil,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  Paperclip,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  reportTypeApi,
  type ReportType,
  type ReportTypeAttachment,
} from '@/lib/dfd';

export interface ReportTypeRegistryProps {
  projectId: string;
  /** 親に最新の一覧を通知（DfdCanvas / DataFlowTable で名前参照するため） */
  onReportTypesChange?: (reportTypes: ReportType[]) => void;
}

export function ReportTypeRegistry({ projectId, onReportTypesChange }: ReportTypeRegistryProps) {
  const [reportTypes, setReportTypes] = useState<ReportType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const notify = onReportTypesChange;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await reportTypeApi.list(projectId);
      setReportTypes(list);
      notify?.(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [projectId, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      await reportTypeApi.create(projectId, { name });
      setNewName('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setCreating(false);
    }
  }, [newName, projectId, load]);

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-2.5">
        <FileText className="h-4 w-4 text-emerald-600" />
        <h3 className="text-sm font-semibold text-gray-800">帳票種別</h3>
        <span className="text-xs text-gray-400">
          データフローが参照する帳票の種別と具体帳票ファイル
        </span>
      </div>

      <div className="p-4 space-y-3">
        {/* 追加フォーム */}
        <div className="flex items-center gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreate();
            }}
            placeholder="帳票種別名（例：受注書）"
            className="flex-1 rounded border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <Button size="sm" onClick={() => void handleCreate()} disabled={creating || !newName.trim()}>
            {creating ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-1 h-4 w-4" />
            )}
            追加
          </Button>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          </div>
        ) : reportTypes.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-400">
            帳票種別がありません。上のフォームから追加してください。
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded border border-gray-100">
            {reportTypes.map((rt) => (
              <ReportTypeRow
                key={rt.id}
                reportType={rt}
                expanded={expanded === rt.id}
                onToggle={() => setExpanded((cur) => (cur === rt.id ? null : rt.id))}
                onChanged={load}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ReportTypeRow({
  reportType,
  expanded,
  onToggle,
  onChanged,
}: {
  reportType: ReportType;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(reportType.name);
  const [attachments, setAttachments] = useState<ReportTypeAttachment[]>([]);
  const [attLoading, setAttLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadAttachments = useCallback(async () => {
    setAttLoading(true);
    try {
      setAttachments(await reportTypeApi.listAttachments(reportType.id));
    } catch {
      /* 一覧失敗は無視 */
    } finally {
      setAttLoading(false);
    }
  }, [reportType.id]);

  useEffect(() => {
    if (expanded) void loadAttachments();
  }, [expanded, loadAttachments]);

  const handleRename = useCallback(async () => {
    const v = name.trim();
    setEditing(false);
    if (!v || v === reportType.name) {
      setName(reportType.name);
      return;
    }
    setBusy(true);
    try {
      await reportTypeApi.update(reportType.id, { name: v });
      await onChanged();
    } finally {
      setBusy(false);
    }
  }, [name, reportType.id, reportType.name, onChanged]);

  const handleDelete = useCallback(async () => {
    if (!confirm(`帳票種別「${reportType.name}」を削除しますか？（具体帳票も削除されます）`)) return;
    setBusy(true);
    try {
      await reportTypeApi.delete(reportType.id);
      await onChanged();
    } finally {
      setBusy(false);
    }
  }, [reportType.id, reportType.name, onChanged]);

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        e.target.value = '';
        setUploading(true);
        try {
          await reportTypeApi.upload(reportType.id, file);
          await loadAttachments();
          await onChanged();
        } finally {
          setUploading(false);
        }
      }
    },
    [reportType.id, loadAttachments, onChanged],
  );

  const handleDeleteAttachment = useCallback(
    async (attachmentId: string) => {
      setBusy(true);
      try {
        await reportTypeApi.deleteAttachment(attachmentId);
        await loadAttachments();
        await onChanged();
      } finally {
        setBusy(false);
      }
    },
    [loadAttachments, onChanged],
  );

  return (
    <li className="px-3 py-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggle}
          className="text-gray-400 hover:text-gray-600"
          title="具体帳票を表示"
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        {editing ? (
          <>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleRename();
                if (e.key === 'Escape') {
                  setName(reportType.name);
                  setEditing(false);
                }
              }}
              className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <button type="button" onClick={() => void handleRename()} className="text-emerald-600 hover:text-emerald-700">
              <Check className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setName(reportType.name);
                setEditing(false);
              }}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        ) : (
          <>
            <span className="flex-1 text-sm font-medium text-gray-800">{reportType.name}</span>
            <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
              <Paperclip className="h-3 w-3" />
              {reportType.attachmentCount}
            </span>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-gray-400 hover:text-blue-600"
              title="名称を編集"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={busy}
              className="text-gray-400 hover:text-red-600 disabled:opacity-40"
              title="削除"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>

      {expanded && (
        <div className="mt-2 ml-6 space-y-2">
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="text-gray-700"
            >
              {uploading ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-1 h-4 w-4" />
              )}
              具体帳票をアップロード
            </Button>
          </div>

          {attLoading ? (
            <div className="py-2">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
            </div>
          ) : attachments.length === 0 ? (
            <p className="text-xs text-gray-400">具体帳票はまだありません。</p>
          ) : (
            <ul className="space-y-1">
              {attachments.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-2 rounded border border-gray-100 bg-gray-50 px-2 py-1 text-xs"
                >
                  <FileText className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                  <span className="flex-1 truncate text-gray-700">{a.filename}</span>
                  <a
                    href={reportTypeApi.fileUrl(a.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 text-blue-600 hover:underline"
                    title="ダウンロード / 表示"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </a>
                  <button
                    type="button"
                    onClick={() => void handleDeleteAttachment(a.id)}
                    disabled={busy}
                    className="text-gray-400 hover:text-red-600 disabled:opacity-40"
                    title="この具体帳票を削除"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}
