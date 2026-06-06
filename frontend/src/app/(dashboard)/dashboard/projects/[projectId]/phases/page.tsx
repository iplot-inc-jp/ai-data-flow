'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  ChevronLeft,
  Loader2,
  Workflow,
  Play,
  CheckCircle2,
  CircleDot,
  CircleSlash,
  Circle,
  ShieldCheck,
  Check,
  ChevronDown,
  ChevronRight,
  Paperclip,
  UploadCloud,
  Trash2,
  FileText,
  ExternalLink,
  X,
  Maximize2,
  Image as ImageIcon,
} from 'lucide-react';
import { HelpTooltip } from '@/components/ui/help-tooltip';
import { HowToPanel } from '@/components/ui/how-to-panel';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5021';

type PhaseKind =
  | 'BACKGROUND'
  | 'ASIS_DATA'
  | 'HEARING'
  | 'ISSUE_ANALYSIS'
  | 'TOBE'
  | 'PROPOSAL'
  | 'REQUIREMENTS'
  | 'EXECUTION';

type PhaseStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'BLOCKED' | 'APPROVED' | 'DONE';

type Phase = {
  id: string;
  projectId: string;
  kind: PhaseKind;
  order: number;
  status: PhaseStatus;
  summary: string | null;
  detail?: string | null;
  metadata: Record<string, unknown>;
};

type Attachment = {
  id: string;
  url: string;
  filename?: string | null;
  mimeType?: string | null;
  caption?: string | null;
  pageRange?: string | null;
  size?: number | null;
};

// カノニカルなフェーズ順（Ph.0〜7）
const PHASE_ORDER: PhaseKind[] = [
  'BACKGROUND',
  'ASIS_DATA',
  'HEARING',
  'ISSUE_ANALYSIS',
  'TOBE',
  'PROPOSAL',
  'REQUIREMENTS',
  'EXECUTION',
];

const phaseLabels: Record<PhaseKind, { ph: string; title: string }> = {
  BACKGROUND: { ph: 'Ph.0', title: '構想・背景理解' },
  ASIS_DATA: { ph: 'Ph.1', title: '現状把握（データ）' },
  HEARING: { ph: 'Ph.2', title: '現状把握（ヒアリング）' },
  ISSUE_ANALYSIS: { ph: 'Ph.3', title: '課題構造化' },
  TOBE: { ph: 'Ph.4', title: 'TOBE設計' },
  PROPOSAL: { ph: 'Ph.5', title: '提案・合意' },
  REQUIREMENTS: { ph: 'Ph.6', title: '要件定義' },
  EXECUTION: { ph: 'Ph.7', title: '推進・動作確認' },
};

const PHASE_STATUSES: PhaseStatus[] = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'BLOCKED',
  'APPROVED',
  'DONE',
];

const statusConfig: Record<
  PhaseStatus,
  {
    label: string;
    badge: string;
    dot: string;
    icon: typeof Circle;
    iconColor: string;
    ring: string;
  }
> = {
  NOT_STARTED: {
    label: '未着手',
    badge: 'text-gray-600 bg-gray-100 border-gray-200',
    dot: 'bg-gray-300',
    icon: Circle,
    iconColor: 'text-gray-400',
    ring: 'border-gray-200',
  },
  IN_PROGRESS: {
    label: '進行中',
    badge: 'text-blue-700 bg-blue-50 border-blue-200',
    dot: 'bg-blue-500',
    icon: CircleDot,
    iconColor: 'text-blue-500',
    ring: 'border-blue-300',
  },
  BLOCKED: {
    label: 'ブロック中',
    badge: 'text-red-700 bg-red-50 border-red-200',
    dot: 'bg-red-500',
    icon: CircleSlash,
    iconColor: 'text-red-500',
    ring: 'border-red-300',
  },
  APPROVED: {
    label: '承認済',
    badge: 'text-amber-700 bg-amber-50 border-amber-200',
    dot: 'bg-amber-500',
    icon: ShieldCheck,
    iconColor: 'text-amber-500',
    ring: 'border-amber-300',
  },
  DONE: {
    label: '完了',
    badge: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    dot: 'bg-emerald-500',
    icon: CheckCircle2,
    iconColor: 'text-emerald-500',
    ring: 'border-emerald-300',
  },
};

// 添付が画像かどうか
function isImageAttachment(att: Attachment): boolean {
  if (att.mimeType) return att.mimeType.startsWith('image/');
  const name = (att.filename ?? att.url ?? '').toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/.test(name);
}

// 添付がPDFかどうか
function isPdfAttachment(att: Attachment): boolean {
  if (att.mimeType) return att.mimeType === 'application/pdf';
  const name = (att.filename ?? att.url ?? '').toLowerCase();
  return name.endsWith('.pdf');
}

// "1-3,5" のようなページ範囲文字列から最初のページ番号を取り出す
function firstPageOf(pageRange?: string | null): number {
  if (!pageRange) return 1;
  const m = pageRange.match(/\d+/);
  if (!m) return 1;
  const n = parseInt(m[0], 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export default function PhasesPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [phases, setPhases] = useState<Phase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(false);
  // 行ごとの更新中フラグ（楽観的UIのためのスピナー制御）
  const [busyId, setBusyId] = useState<string | null>(null);
  // textarea のローカル編集値（blur で PUT）
  const [summaryDrafts, setSummaryDrafts] = useState<Record<string, string>>({});
  const [detailDrafts, setDetailDrafts] = useState<Record<string, string>>({});

  // 展開中のフェーズ
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // 「保存しました」インジケータ（フェーズID → 種別）
  const [savedFlag, setSavedFlag] = useState<Record<string, 'summary' | 'detail'>>({});

  // 添付（フェーズID → 添付一覧）
  const [attachments, setAttachments] = useState<Record<string, Attachment[]>>({});
  const [attLoadingId, setAttLoadingId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  // キャプション / ページ範囲のローカル編集値（添付ID → 値）
  const [captionDrafts, setCaptionDrafts] = useState<Record<string, string>>({});
  const [pageRangeDrafts, setPageRangeDrafts] = useState<Record<string, string>>({});
  // ライトボックス
  const [lightbox, setLightbox] = useState<Attachment | null>(null);
  // 操作方法ダイアログ
  const [howToOpen, setHowToOpen] = useState(false);

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const getHeaders = useCallback(() => {
    const token = localStorage.getItem('accessToken');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }, []);

  // multipart 用：Content-Type を付けない（ブラウザに boundary を任せる）
  const getAuthOnlyHeaders = useCallback(() => {
    const token = localStorage.getItem('accessToken');
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }, []);

  const fetchPhases = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = getHeaders();
      const res = await fetch(`${API_URL}/api/projects/${projectId}/phases`, { headers });
      if (!res.ok) {
        throw new Error('フェーズの取得に失敗しました');
      }
      const data: Phase[] = await res.json();
      // カノニカル順にソート（order → kind順）
      const sorted = [...data].sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return PHASE_ORDER.indexOf(a.kind) - PHASE_ORDER.indexOf(b.kind);
      });
      setPhases(sorted);
      // ドラフトを同期
      const sDrafts: Record<string, string> = {};
      const dDrafts: Record<string, string> = {};
      sorted.forEach((p) => {
        sDrafts[p.id] = p.summary ?? '';
        dDrafts[p.id] = p.detail ?? '';
      });
      setSummaryDrafts(sDrafts);
      setDetailDrafts(dDrafts);
    } catch (err) {
      console.error('Failed to fetch phases:', err);
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, [projectId, getHeaders]);

  useEffect(() => {
    fetchPhases();
  }, [fetchPhases]);

  // 保存しましたインジケータを一定時間表示
  const flashSaved = useCallback((phaseId: string, kind: 'summary' | 'detail') => {
    setSavedFlag((prev) => ({ ...prev, [phaseId]: kind }));
    window.setTimeout(() => {
      setSavedFlag((prev) => {
        const next = { ...prev };
        delete next[phaseId];
        return next;
      });
    }, 2000);
  }, []);

  // 添付の再取得
  const fetchAttachments = useCallback(
    async (phaseId: string) => {
      setAttLoadingId(phaseId);
      try {
        const headers = getHeaders();
        const res = await fetch(
          `${API_URL}/api/projects/${projectId}/phases/${phaseId}/attachments`,
          { headers }
        );
        if (!res.ok) {
          throw new Error('添付の取得に失敗しました');
        }
        const data: Attachment[] = await res.json();
        setAttachments((prev) => ({ ...prev, [phaseId]: data }));
        // キャプション / ページ範囲のドラフトを同期
        setCaptionDrafts((prev) => {
          const next = { ...prev };
          data.forEach((a) => {
            next[a.id] = a.caption ?? '';
          });
          return next;
        });
        setPageRangeDrafts((prev) => {
          const next = { ...prev };
          data.forEach((a) => {
            next[a.id] = a.pageRange ?? '';
          });
          return next;
        });
      } catch (err) {
        console.error('Failed to fetch attachments:', err);
        setError(err instanceof Error ? err.message : 'エラーが発生しました');
      } finally {
        setAttLoadingId(null);
      }
    },
    [projectId, getHeaders]
  );

  // フェーズ展開のトグル（初回展開時に添付を取得）
  const toggleExpand = useCallback(
    (phaseId: string) => {
      setExpandedId((prev) => {
        const next = prev === phaseId ? null : phaseId;
        if (next === phaseId && attachments[phaseId] === undefined) {
          void fetchAttachments(phaseId);
        }
        return next;
      });
    },
    [attachments, fetchAttachments]
  );

  // パイプライン初期化（冪等）
  const handleInitialize = async () => {
    setInitializing(true);
    setError(null);
    try {
      const headers = getHeaders();
      const res = await fetch(`${API_URL}/api/projects/${projectId}/phases/initialize`, {
        method: 'POST',
        headers,
      });
      if (!res.ok) {
        throw new Error('パイプラインの初期化に失敗しました');
      }
      await fetchPhases();
    } catch (err) {
      console.error('Failed to initialize phases:', err);
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setInitializing(false);
    }
  };

  // キーボードショートカット
  // - mod+Enter / n : 不足フェーズを補完（=パイプライン初期化。冪等）
  // - mod+s         : 既定の保存挙動を抑止（編集内容は blur で自動保存されるため、誤操作で離脱しないように）
  // - shift+/（?）   : 操作方法ダイアログを開く
  useKeyboardShortcuts([
    { combo: 'mod+enter', handler: () => { if (!initializing) void handleInitialize(); } },
    { combo: 'n', handler: () => { if (!initializing) void handleInitialize(); } },
    { combo: 'mod+s', handler: () => { /* blur で自動保存。ブラウザ保存ダイアログを抑止 */ }, whenTyping: true },
    { combo: 'shift+/', handler: () => setHowToOpen(true) },
  ]);

  // サマリ更新（PUT）— blur 時に呼ぶ
  const handleSummaryBlur = async (phase: Phase) => {
    const draft = summaryDrafts[phase.id] ?? '';
    const current = phase.summary ?? '';
    if (draft === current) return; // 変更なし
    setBusyId(phase.id);
    try {
      const headers = getHeaders();
      const res = await fetch(`${API_URL}/api/phases/${phase.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ summary: draft }),
      });
      if (!res.ok) {
        throw new Error('サマリの更新に失敗しました');
      }
      const updated: Phase = await res.json();
      setPhases((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
      flashSaved(phase.id, 'summary');
    } catch (err) {
      console.error('Failed to update summary:', err);
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
      // 失敗時はドラフトを元に戻す
      setSummaryDrafts((prev) => ({ ...prev, [phase.id]: current }));
    } finally {
      setBusyId(null);
    }
  };

  // 詳細更新（PUT）— blur 時に呼ぶ
  const handleDetailBlur = async (phase: Phase) => {
    const draft = detailDrafts[phase.id] ?? '';
    const current = phase.detail ?? '';
    if (draft === current) return; // 変更なし
    setBusyId(phase.id);
    try {
      const headers = getHeaders();
      const res = await fetch(`${API_URL}/api/phases/${phase.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ detail: draft }),
      });
      if (!res.ok) {
        throw new Error('詳細の更新に失敗しました');
      }
      const updated: Phase = await res.json();
      setPhases((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
      flashSaved(phase.id, 'detail');
    } catch (err) {
      console.error('Failed to update detail:', err);
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
      setDetailDrafts((prev) => ({ ...prev, [phase.id]: current }));
    } finally {
      setBusyId(null);
    }
  };

  // 状態遷移（POST transition）
  const handleTransition = async (phase: Phase, status: PhaseStatus) => {
    if (phase.status === status) return;
    setBusyId(phase.id);
    setError(null);
    try {
      const headers = getHeaders();
      const res = await fetch(`${API_URL}/api/phases/${phase.id}/transition`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        throw new Error('状態の遷移に失敗しました');
      }
      const updated: Phase = await res.json();
      setPhases((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
    } catch (err) {
      console.error('Failed to transition phase:', err);
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setBusyId(null);
    }
  };

  // 添付アップロード（multipart）
  const handleUploadFiles = useCallback(
    async (phaseId: string, files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      setUploadingId(phaseId);
      setError(null);
      try {
        for (const file of list) {
          const form = new FormData();
          form.append('file', file);
          // 注意: Content-Type を手動で設定しない（ブラウザが boundary を付与する）
          const res = await fetch(
            `${API_URL}/api/projects/${projectId}/phases/${phaseId}/attachments`,
            {
              method: 'POST',
              headers: getAuthOnlyHeaders(),
              body: form,
            }
          );
          if (!res.ok) {
            throw new Error('ファイルのアップロードに失敗しました');
          }
        }
        // アップロード後に再取得
        await fetchAttachments(phaseId);
      } catch (err) {
        console.error('Failed to upload attachment:', err);
        setError(err instanceof Error ? err.message : 'エラーが発生しました');
      } finally {
        setUploadingId(null);
      }
    },
    [projectId, getAuthOnlyHeaders, fetchAttachments]
  );

  // キャプション更新（PUT）
  const handleCaptionBlur = useCallback(
    async (phaseId: string, att: Attachment) => {
      const draft = captionDrafts[att.id] ?? '';
      const current = att.caption ?? '';
      if (draft === current) return;
      try {
        const headers = getHeaders();
        const res = await fetch(`${API_URL}/api/attachments/${att.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ caption: draft }),
        });
        if (!res.ok) {
          throw new Error('キャプションの更新に失敗しました');
        }
        const updated: Attachment = await res.json();
        setAttachments((prev) => ({
          ...prev,
          [phaseId]: (prev[phaseId] ?? []).map((a) =>
            a.id === updated.id ? { ...a, ...updated } : a
          ),
        }));
      } catch (err) {
        console.error('Failed to update caption:', err);
        setError(err instanceof Error ? err.message : 'エラーが発生しました');
        setCaptionDrafts((prev) => ({ ...prev, [att.id]: current }));
      }
    },
    [captionDrafts, getHeaders]
  );

  // ページ範囲更新（PUT）
  const handlePageRangeBlur = useCallback(
    async (phaseId: string, att: Attachment) => {
      const draft = pageRangeDrafts[att.id] ?? '';
      const current = att.pageRange ?? '';
      if (draft === current) return;
      try {
        const headers = getHeaders();
        const res = await fetch(`${API_URL}/api/attachments/${att.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ pageRange: draft }),
        });
        if (!res.ok) {
          throw new Error('ページ範囲の更新に失敗しました');
        }
        const updated: Attachment = await res.json();
        setAttachments((prev) => ({
          ...prev,
          [phaseId]: (prev[phaseId] ?? []).map((a) =>
            a.id === updated.id ? { ...a, ...updated } : a
          ),
        }));
      } catch (err) {
        console.error('Failed to update page range:', err);
        setError(err instanceof Error ? err.message : 'エラーが発生しました');
        setPageRangeDrafts((prev) => ({ ...prev, [att.id]: current }));
      }
    },
    [pageRangeDrafts, getHeaders]
  );

  // 添付削除（DELETE）
  const handleDeleteAttachment = useCallback(
    async (phaseId: string, att: Attachment) => {
      if (!window.confirm('この添付を削除しますか？')) return;
      try {
        const headers = getHeaders();
        const res = await fetch(`${API_URL}/api/attachments/${att.id}`, {
          method: 'DELETE',
          headers,
        });
        if (!res.ok) {
          throw new Error('添付の削除に失敗しました');
        }
        setAttachments((prev) => ({
          ...prev,
          [phaseId]: (prev[phaseId] ?? []).filter((a) => a.id !== att.id),
        }));
      } catch (err) {
        console.error('Failed to delete attachment:', err);
        setError(err instanceof Error ? err.message : 'エラーが発生しました');
      }
    },
    [getHeaders]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const doneCount = phases.filter((p) => p.status === 'DONE').length;

  return (
    <div className="space-y-6" style={{ fontFamily: '"Yu Gothic", "游ゴシック", YuGothic, sans-serif' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/dashboard/projects/${projectId}`}>
            <Button variant="ghost" size="sm" className="text-gray-600">
              <ChevronLeft className="w-4 h-4 mr-1" />
              戻る
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              フェーズ
              <HelpTooltip text="Ph.0〜7 はプロジェクト推進の標準パイプラインです。背景理解→現状把握→課題構造化→TOBE設計→提案→要件定義→推進の順に進めます。" />
            </h1>
            <p className="text-gray-500 mt-1">
              Ph.0〜7 のプロジェクト推進パイプライン
              {phases.length > 0 && (
                <span className="ml-2 text-sm text-gray-400">
                  （{doneCount} / {phases.length} 完了）
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <HowToPanel
            open={howToOpen}
            onOpenChange={setHowToOpen}
            steps={[
              'フェーズが無い場合は「パイプラインを初期化」で Ph.0〜7 の8フェーズを一括作成します。',
              '各カードのサマリ欄は入力後に欄外をクリック（blur）すると自動保存されます。',
              'カードヘッダをクリックすると展開し、詳細メモの編集と画像・PDFの添付ができます。',
              '「状態を変更」で 未着手→進行中→（承認済）→完了 などにステータスを切り替えます。',
              '「不足フェーズを補完」は、欠けている標準フェーズだけを安全に追加します（既存は維持・冪等）。',
            ]}
            shortcuts={[
              { keys: '⌘/Ctrl+Enter', desc: '不足フェーズを補完' },
              { keys: 'n', desc: '不足フェーズを補完' },
              { keys: '⌘/Ctrl+S', desc: '保存（編集は blur で自動保存）' },
              { keys: '?', desc: 'この操作方法を開く' },
            ]}
          />
          {phases.length > 0 && (
            <Button
              variant="outline"
              onClick={handleInitialize}
              disabled={initializing}
              className="border-blue-300 text-blue-700 hover:bg-blue-50"
            >
              {initializing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  同期中...
                </>
              ) : (
                <>
                  <Workflow className="h-4 w-4 mr-2" />
                  不足フェーズを補完
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* 空状態：初期化ボタン */}
      {phases.length === 0 ? (
        <Card className="bg-white border-gray-200">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <Workflow className="h-8 w-8 text-gray-400" />
            </div>
            <p className="text-gray-500 mb-2">フェーズがまだありません</p>
            <p className="text-sm text-gray-400 mb-4">
              Ph.0〜7 の8フェーズからなる推進パイプラインを初期化してください
            </p>
            <Button
              onClick={handleInitialize}
              disabled={initializing}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {initializing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  初期化中...
                </>
              ) : (
                <>
                  <Workflow className="h-4 w-4 mr-2" />
                  パイプラインを初期化
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      ) : (
        /* パイプライン（縦並び） */
        <div className="relative">
          {phases.map((phase, index) => {
            const label = phaseLabels[phase.kind] ?? {
              ph: `Ph.${phase.order}`,
              title: phase.kind,
            };
            const cfg = statusConfig[phase.status] ?? statusConfig.NOT_STARTED;
            const StatusIcon = cfg.icon;
            const isLast = index === phases.length - 1;
            const isBusy = busyId === phase.id;
            const isExpanded = expandedId === phase.id;
            const phaseAtts = attachments[phase.id] ?? [];
            const imageAtts = phaseAtts.filter(isImageAttachment);
            const pdfAtts = phaseAtts.filter(isPdfAttachment);
            const otherAtts = phaseAtts.filter(
              (a) => !isImageAttachment(a) && !isPdfAttachment(a)
            );
            const saved = savedFlag[phase.id];

            return (
              <div key={phase.id} className="relative flex gap-4">
                {/* タイムライン（アイコン + コネクタ線） */}
                <div className="flex flex-col items-center">
                  <div
                    className={`relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 bg-white ${cfg.ring}`}
                  >
                    <StatusIcon className={`h-5 w-5 ${cfg.iconColor}`} />
                  </div>
                  {/* コネクタ線（最後以外） */}
                  {!isLast && (
                    <div className="w-0.5 flex-1 bg-gray-200" style={{ minHeight: '1.5rem' }} />
                  )}
                </div>

                {/* フェーズカード */}
                <div className={`flex-1 ${isLast ? 'pb-0' : 'pb-6'}`}>
                  <Card className="bg-white border-gray-200">
                    <CardContent className="p-5">
                      {/* カードヘッダ（クリックで展開トグル） */}
                      <button
                        type="button"
                        onClick={() => toggleExpand(phase.id)}
                        className="w-full flex items-start justify-between gap-4 mb-3 text-left"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                          )}
                          <span className="text-xs font-mono font-semibold text-blue-600 bg-blue-50 border border-blue-100 rounded px-2 py-0.5 shrink-0">
                            {label.ph}
                          </span>
                          <h3 className="font-semibold text-gray-900 truncate">{label.title}</h3>
                          {phaseAtts.length > 0 && (
                            <span className="flex items-center gap-1 text-xs text-gray-400 shrink-0">
                              <Paperclip className="h-3 w-3" />
                              {phaseAtts.length}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isBusy && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
                          <span
                            className={`text-xs px-2 py-1 rounded border font-medium ${cfg.badge}`}
                          >
                            {cfg.label}
                          </span>
                        </div>
                      </button>

                      {/* サマリ（編集可・blur で PUT） */}
                      <div className="relative">
                        <Textarea
                          placeholder="このフェーズのサマリ・メモを入力..."
                          value={summaryDrafts[phase.id] ?? ''}
                          onChange={(e) =>
                            setSummaryDrafts((prev) => ({
                              ...prev,
                              [phase.id]: e.target.value,
                            }))
                          }
                          onBlur={() => handleSummaryBlur(phase)}
                          disabled={isBusy}
                          className="min-h-[72px] bg-white border-gray-300 text-sm resize-y"
                        />
                        {saved === 'summary' && (
                          <span className="absolute top-1 right-2 flex items-center gap-1 text-xs text-emerald-600">
                            <Check className="h-3 w-3" />
                            保存しました
                          </span>
                        )}
                      </div>

                      {/* 状態遷移ボタン */}
                      <div className="flex flex-wrap items-center gap-2 mt-3">
                        <span className="text-xs text-gray-400 mr-1 flex items-center gap-1">
                          <Play className="h-3 w-3" />
                          状態を変更:
                          <HelpTooltip text="このフェーズの進捗ステータスです。未着手・進行中・ブロック中・承認済・完了から選びます。完了数は上部に集計されます。" />
                        </span>
                        {PHASE_STATUSES.map((s) => {
                          const sCfg = statusConfig[s];
                          const active = phase.status === s;
                          return (
                            <button
                              key={s}
                              type="button"
                              disabled={isBusy || active}
                              onClick={() => handleTransition(phase, s)}
                              className={`text-xs px-2.5 py-1 rounded border transition-colors flex items-center gap-1 ${
                                active
                                  ? `${sCfg.badge} cursor-default font-medium`
                                  : 'text-gray-600 bg-white border-gray-200 hover:bg-gray-50 disabled:opacity-50'
                              }`}
                            >
                              {active && <Check className="h-3 w-3" />}
                              {sCfg.label}
                            </button>
                          );
                        })}
                      </div>

                      {/* 展開：詳細編集 + 添付 */}
                      {isExpanded && (
                        <div className="mt-5 pt-5 border-t border-gray-200 space-y-6">
                          {/* 詳細編集 */}
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                                <FileText className="h-4 w-4 text-gray-500" />
                                詳細編集
                              </h4>
                              {saved === 'detail' && (
                                <span className="flex items-center gap-1 text-xs text-emerald-600">
                                  <Check className="h-3 w-3" />
                                  保存しました
                                </span>
                              )}
                            </div>
                            <Textarea
                              placeholder="このフェーズの詳細を入力（議事メモ、検討内容、決定事項など）..."
                              value={detailDrafts[phase.id] ?? ''}
                              onChange={(e) =>
                                setDetailDrafts((prev) => ({
                                  ...prev,
                                  [phase.id]: e.target.value,
                                }))
                              }
                              onBlur={() => handleDetailBlur(phase)}
                              disabled={isBusy}
                              className="min-h-[200px] bg-white border-gray-300 text-sm resize-y leading-relaxed"
                            />
                          </div>

                          {/* 添付 */}
                          <div>
                            <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5 mb-2">
                              <Paperclip className="h-4 w-4 text-gray-500" />
                              添付
                              <HelpTooltip text="このフェーズの根拠資料（画像・PDFなど）を添付できます。PDFは「ページ選択」で表示するページを指定でき、画像はクリックで拡大します。" />
                              {attLoadingId === phase.id && (
                                <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
                              )}
                            </h4>

                            {/* アップローダ（ドラッグ&ドロップ + ファイル選択） */}
                            <div
                              onDragOver={(e) => {
                                e.preventDefault();
                                setDragOverId(phase.id);
                              }}
                              onDragLeave={() => setDragOverId(null)}
                              onDrop={(e) => {
                                e.preventDefault();
                                setDragOverId(null);
                                if (e.dataTransfer.files.length > 0) {
                                  void handleUploadFiles(phase.id, e.dataTransfer.files);
                                }
                              }}
                              onClick={() => fileInputRefs.current[phase.id]?.click()}
                              className={`flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-6 cursor-pointer transition-colors ${
                                dragOverId === phase.id
                                  ? 'border-blue-400 bg-blue-50'
                                  : 'border-gray-300 bg-gray-50 hover:bg-gray-100'
                              }`}
                            >
                              {uploadingId === phase.id ? (
                                <>
                                  <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                                  <span className="text-sm text-gray-500">アップロード中...</span>
                                </>
                              ) : (
                                <>
                                  <UploadCloud className="h-6 w-6 text-gray-400" />
                                  <span className="text-sm text-gray-600">
                                    ファイルをドラッグ&ドロップ、またはクリックして選択
                                  </span>
                                  <span className="text-xs text-gray-400">
                                    画像 / PDF などをアップロードできます
                                  </span>
                                </>
                              )}
                              <input
                                ref={(el) => {
                                  fileInputRefs.current[phase.id] = el;
                                }}
                                type="file"
                                multiple
                                accept="image/*,application/pdf"
                                className="hidden"
                                onChange={(e) => {
                                  if (e.target.files && e.target.files.length > 0) {
                                    void handleUploadFiles(phase.id, e.target.files);
                                  }
                                  e.target.value = '';
                                }}
                              />
                            </div>

                            {/* 画像ギャラリー */}
                            {imageAtts.length > 0 && (
                              <div className="mt-4">
                                <h5 className="text-xs font-semibold text-gray-500 flex items-center gap-1 mb-2">
                                  <ImageIcon className="h-3.5 w-3.5" />
                                  画像
                                </h5>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                  {imageAtts.map((att) => (
                                    <div
                                      key={att.id}
                                      className="group relative rounded-lg border border-gray-200 bg-white overflow-hidden"
                                    >
                                      <button
                                        type="button"
                                        onClick={() => setLightbox(att)}
                                        className="relative block w-full aspect-square bg-gray-50"
                                        title="クリックで拡大"
                                      >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                          src={`${API_URL}${att.url}`}
                                          alt={att.caption ?? att.filename ?? '添付画像'}
                                          className="w-full h-full object-cover"
                                        />
                                        <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
                                          <Maximize2 className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </span>
                                      </button>
                                      <div className="p-2 space-y-1.5">
                                        <input
                                          type="text"
                                          placeholder="キャプション..."
                                          value={captionDrafts[att.id] ?? ''}
                                          onChange={(e) =>
                                            setCaptionDrafts((prev) => ({
                                              ...prev,
                                              [att.id]: e.target.value,
                                            }))
                                          }
                                          onBlur={() => handleCaptionBlur(phase.id, att)}
                                          className="w-full text-xs border border-gray-200 rounded px-1.5 py-1 text-gray-700 focus:outline-none focus:border-blue-300"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteAttachment(phase.id, att)}
                                          className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600"
                                        >
                                          <Trash2 className="h-3 w-3" />
                                          削除
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* PDF 一覧 */}
                            {pdfAtts.length > 0 && (
                              <div className="mt-4 space-y-4">
                                <h5 className="text-xs font-semibold text-gray-500 flex items-center gap-1">
                                  <FileText className="h-3.5 w-3.5" />
                                  PDF
                                </h5>
                                {pdfAtts.map((att) => {
                                  const firstPage = firstPageOf(pageRangeDrafts[att.id] ?? att.pageRange);
                                  const fileSrc = `${API_URL}${att.url}`;
                                  return (
                                    <div
                                      key={att.id}
                                      className="rounded-lg border border-gray-200 bg-white p-3"
                                    >
                                      <div className="flex items-center justify-between gap-2 mb-2">
                                        <span className="flex items-center gap-1.5 text-sm text-gray-700 truncate min-w-0">
                                          <FileText className="h-4 w-4 text-red-500 shrink-0" />
                                          <span className="truncate">
                                            {att.filename ?? 'PDF ファイル'}
                                          </span>
                                        </span>
                                        <div className="flex items-center gap-3 shrink-0">
                                          <a
                                            href={fileSrc}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                                          >
                                            <ExternalLink className="h-3 w-3" />
                                            全体を開く
                                          </a>
                                          <button
                                            type="button"
                                            onClick={() => handleDeleteAttachment(phase.id, att)}
                                            className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600"
                                          >
                                            <Trash2 className="h-3 w-3" />
                                            削除
                                          </button>
                                        </div>
                                      </div>

                                      {/* ページ選択 */}
                                      <div className="flex items-center gap-2 mb-2">
                                        <label className="text-xs text-gray-500 shrink-0">
                                          ページ選択:
                                        </label>
                                        <input
                                          type="text"
                                          placeholder="例: 1-3,5"
                                          value={pageRangeDrafts[att.id] ?? ''}
                                          onChange={(e) =>
                                            setPageRangeDrafts((prev) => ({
                                              ...prev,
                                              [att.id]: e.target.value,
                                            }))
                                          }
                                          onBlur={() => handlePageRangeBlur(phase.id, att)}
                                          className="w-32 text-xs border border-gray-200 rounded px-1.5 py-1 text-gray-700 focus:outline-none focus:border-blue-300"
                                        />
                                        <span className="text-xs text-gray-400">
                                          （プレビューは {firstPage} ページ目を表示）
                                        </span>
                                      </div>

                                      {/* インライン PDF プレビュー（ブラウザ標準ビューア） */}
                                      <iframe
                                        src={`${fileSrc}#page=${firstPage}`}
                                        title={att.filename ?? 'PDF プレビュー'}
                                        className="w-full h-[480px] rounded border border-gray-200 bg-gray-50"
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* その他の添付 */}
                            {otherAtts.length > 0 && (
                              <div className="mt-4 space-y-2">
                                <h5 className="text-xs font-semibold text-gray-500 flex items-center gap-1">
                                  <Paperclip className="h-3.5 w-3.5" />
                                  その他
                                </h5>
                                {otherAtts.map((att) => (
                                  <div
                                    key={att.id}
                                    className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2"
                                  >
                                    <a
                                      href={`${API_URL}${att.url}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 truncate min-w-0"
                                    >
                                      <Paperclip className="h-4 w-4 shrink-0" />
                                      <span className="truncate">
                                        {att.filename ?? 'ファイル'}
                                      </span>
                                    </a>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteAttachment(phase.id, att)}
                                      className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 shrink-0"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                      削除
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* 添付が空 */}
                            {phaseAtts.length === 0 && attLoadingId !== phase.id && (
                              <p className="mt-3 text-xs text-gray-400 text-center">
                                添付はまだありません
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 画像ライトボックス */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setLightbox(null)}
        >
          <div
            className="relative max-w-5xl max-h-[90vh] bg-white rounded-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setLightbox(null)}
              className="absolute top-2 right-2 z-10 flex items-center justify-center h-8 w-8 rounded-full bg-white/90 border border-gray-200 text-gray-600 hover:bg-white"
              title="閉じる"
            >
              <X className="h-4 w-4" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${API_URL}${lightbox.url}`}
              alt={lightbox.caption ?? lightbox.filename ?? '添付画像'}
              className="block max-w-full max-h-[80vh] object-contain"
            />
            {(lightbox.caption || lightbox.filename) && (
              <div className="px-4 py-2 text-sm text-gray-700 border-t border-gray-100">
                {lightbox.caption ?? lightbox.filename}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
