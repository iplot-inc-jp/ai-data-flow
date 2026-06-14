'use client';

// 【管理者向け】タスク Webhook（outbound）設定パネル。
//
// 方向は Brain Pro → 外部（ipro-kun 等）。タスクの作成/更新/状態変更/削除を購読し、
// 指定 URL へ配信する。配信そのものは backend の WEBHOOK_DELIVERY ジョブが行い、
// その成否はバッチ管理（type=WEBHOOK_DELIVERY）で確認できる旨を案内する。
//
// 認可: 一覧/CRUD/test はすべてプロジェクト管理者限定。非管理者には backend が 403 を返す
// ため、その場合は「管理者のみ」の案内を表示する（バックエンドが最終防御線）。
//
// secret は伏字運用。サーバから値は返らず（hasSecret のみ）、入力時のみ更新する。

import { useCallback, useEffect, useState } from 'react';
import {
  Webhook as WebhookIcon,
  Plus,
  Trash2,
  Pencil,
  Loader2,
  Send,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  Power,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { HelpTooltip } from '@/components/ui/help-tooltip';
import {
  webhooksApi,
  WebhookApiError,
  WEBHOOK_EVENTS,
  webhookEventLabel,
  type Webhook,
  type WebhookEvent,
} from '@/lib/webhooks';

// 簡易トグル（switch コンポーネントが無いためインライン実装。integrations と同系統の見た目）
function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50 ${
        checked ? 'bg-blue-600' : 'bg-gray-300'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

type FormState = {
  targetUrl: string;
  /** 入力時のみ更新。プレースホルダのみで現在値は表示しない。 */
  secret: string;
  events: WebhookEvent[];
  label: string;
  active: boolean;
};

const emptyForm: FormState = {
  targetUrl: '',
  secret: '',
  events: ['task.created', 'task.updated', 'task.status_changed', 'task.deleted'],
  label: '',
  active: true,
};

export function WebhooksAdminPanel({ projectId }: { projectId: string }) {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 作成/編集フォーム
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // 編集時に secret を「解除」するフラグ（既存 secret を null で消す）
  const [clearSecret, setClearSecret] = useState(false);

  // テスト送信状態（webhookId → メッセージ）
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState<
    Record<string, { kind: 'ok' | 'err'; text: string }>
  >({});

  const fetchWebhooks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await webhooksApi.list(projectId);
      setForbidden(false);
      setWebhooks(Array.isArray(data) ? data : []);
    } catch (err) {
      if (err instanceof WebhookApiError && err.status === 403) {
        setForbidden(true);
        setWebhooks([]);
      } else {
        setError(
          err instanceof Error ? err.message : 'Webhook 一覧の取得に失敗しました',
        );
      }
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void fetchWebhooks();
  }, [fetchWebhooks]);

  // ---- フォーム操作 ----
  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setClearSecret(false);
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = (w: Webhook) => {
    setEditingId(w.id);
    setForm({
      targetUrl: w.targetUrl,
      secret: '',
      events: w.events.filter((e): e is WebhookEvent =>
        WEBHOOK_EVENTS.some((opt) => opt.value === e),
      ),
      label: w.label ?? '',
      active: w.active,
    });
    setClearSecret(false);
    setFormError(null);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setClearSecret(false);
    setFormError(null);
  };

  const toggleEvent = (event: WebhookEvent) => {
    setForm((f) => ({
      ...f,
      events: f.events.includes(event)
        ? f.events.filter((e) => e !== event)
        : [...f.events, event],
    }));
  };

  const editing = editingId ? webhooks.find((w) => w.id === editingId) : null;

  const handleSave = async () => {
    const targetUrl = form.targetUrl.trim();
    if (!targetUrl) {
      setFormError('送信先 URL は必須です');
      return;
    }
    if (form.events.length === 0) {
      setFormError('購読するイベントを1つ以上選択してください');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editingId) {
        // secret: 入力があれば差し替え、解除フラグなら null、どちらも無ければ省略（変更なし）
        const secret = clearSecret
          ? null
          : form.secret.length > 0
            ? form.secret
            : undefined;
        await webhooksApi.update(editingId, {
          targetUrl,
          events: form.events,
          label: form.label.trim() || null,
          active: form.active,
          ...(secret !== undefined ? { secret } : {}),
        });
      } else {
        await webhooksApi.create(projectId, {
          targetUrl,
          secret: form.secret.length > 0 ? form.secret : undefined,
          events: form.events,
          label: form.label.trim() || undefined,
          active: form.active,
        });
      }
      closeForm();
      await fetchWebhooks();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (w: Webhook) => {
    const next = !w.active;
    // 楽観的更新
    setWebhooks((prev) =>
      prev.map((x) => (x.id === w.id ? { ...x, active: next } : x)),
    );
    try {
      await webhooksApi.update(w.id, { active: next });
    } catch {
      await fetchWebhooks();
    }
  };

  const handleDelete = async (w: Webhook) => {
    if (
      !confirm(
        `Webhook「${w.label || w.targetUrl}」を削除してもよろしいですか？`,
      )
    )
      return;
    try {
      await webhooksApi.delete(w.id);
      setWebhooks((prev) => prev.filter((x) => x.id !== w.id));
    } catch (err) {
      console.error('Failed to delete webhook:', err);
      await fetchWebhooks();
    }
  };

  const handleTest = async (w: Webhook) => {
    setTestingId(w.id);
    setTestMsg((prev) => {
      const next = { ...prev };
      delete next[w.id];
      return next;
    });
    try {
      const res = await webhooksApi.test(w.id);
      setTestMsg((prev) => ({
        ...prev,
        [w.id]: {
          kind: 'ok',
          text: `テスト配信を起票しました（ジョブ ${res.status}）。配信結果はバッチ管理で確認できます。`,
        },
      }));
    } catch (err) {
      setTestMsg((prev) => ({
        ...prev,
        [w.id]: {
          kind: 'err',
          text:
            err instanceof Error ? err.message : 'テスト送信に失敗しました',
        },
      }));
    } finally {
      setTestingId(null);
    }
  };

  return (
    <Card className="bg-white border-gray-200">
      <CardContent className="p-5 space-y-4">
        {/* ヘッダ */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <WebhookIcon className="h-5 w-5 text-gray-500" />
            タスク Webhook（外部送信）
            <HelpTooltip text="タスクの作成・更新・状態変更・削除を購読し、指定した URL へ JSON で配信します（Brain Pro → 外部）。secret を設定すると配信に署名を付けられます。実際の配信はバックグラウンドジョブで行われ、成否はバッチ管理（種別 WEBHOOK_DELIVERY）で確認できます。" />
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700">
              <ShieldAlert className="h-3 w-3" />
              管理者限定
            </span>
          </h2>
          {!forbidden && !loading && (
            <Button
              size="sm"
              onClick={openCreate}
              className="bg-blue-600 hover:bg-blue-700 gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Webhook を追加
            </Button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-gray-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : forbidden ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <ShieldAlert className="h-5 w-5 flex-shrink-0" />
            <div>
              <p className="font-medium">管理者のみ</p>
              <p className="mt-0.5 text-amber-700">
                Webhook の設定はプロジェクト管理者のみが行えます。
              </p>
            </div>
          </div>
        ) : (
          <>
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}

            {/* 配信成否の案内（バッチ管理へのリンク） */}
            <p className="text-xs text-gray-500">
              配信の成否（成功 / 失敗・自動リトライ）は、下の
              <span className="font-medium text-gray-700">
                {' '}
                バックグラウンド処理 / バッチ管理{' '}
              </span>
              （種別{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">
                WEBHOOK_DELIVERY
              </code>
              ）で確認できます。
            </p>

            {/* 作成/編集フォーム */}
            {showForm && (
              <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-4 space-y-4">
                <h3 className="text-sm font-semibold text-gray-900">
                  {editingId ? 'Webhook を編集' : 'Webhook を追加'}
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-gray-700">
                      送信先 URL <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      placeholder="https://example.com/webhooks/tasks"
                      value={form.targetUrl}
                      onChange={(e) =>
                        setForm({ ...form, targetUrl: e.target.value })
                      }
                      className="bg-white border-gray-300 font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-gray-700">ラベル（任意）</Label>
                    <Input
                      placeholder="例：ipro-kun 連携"
                      value={form.label}
                      onChange={(e) =>
                        setForm({ ...form, label: e.target.value })
                      }
                      className="bg-white border-gray-300"
                    />
                  </div>
                </div>

                {/* secret */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-gray-700">署名シークレット（任意）</Label>
                    <HelpTooltip text="設定すると配信リクエストに署名（HMAC）が付き、受信側で改ざん検知できます。保存後は値を表示できません（伏字運用）。編集時は、空のままなら変更されません。" />
                  </div>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    placeholder={
                      editing?.hasSecret
                        ? '設定済み（変更する場合のみ入力）'
                        : '未設定（必要なら入力）'
                    }
                    value={form.secret}
                    disabled={clearSecret}
                    onChange={(e) =>
                      setForm({ ...form, secret: e.target.value })
                    }
                    className="bg-white border-gray-300 font-mono disabled:opacity-50"
                  />
                  {editingId && editing?.hasSecret && (
                    <label className="flex items-center gap-2 text-xs text-gray-600">
                      <input
                        type="checkbox"
                        checked={clearSecret}
                        onChange={(e) => {
                          setClearSecret(e.target.checked);
                          if (e.target.checked) setForm((f) => ({ ...f, secret: '' }));
                        }}
                        className="h-3.5 w-3.5 accent-red-500"
                      />
                      署名シークレットを解除する（署名なしに戻す）
                    </label>
                  )}
                </div>

                {/* イベント選択 */}
                <div className="space-y-1.5">
                  <Label className="text-gray-700">購読イベント</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {WEBHOOK_EVENTS.map((opt) => (
                      <label
                        key={opt.value}
                        className="flex items-start gap-2 rounded-md border border-gray-200 bg-white px-2.5 py-2 text-sm text-gray-700 cursor-pointer hover:border-gray-300"
                      >
                        <input
                          type="checkbox"
                          checked={form.events.includes(opt.value)}
                          onChange={() => toggleEvent(opt.value)}
                          className="mt-0.5 h-4 w-4 accent-blue-600"
                        />
                        <span>
                          <span className="font-medium">{opt.label}</span>
                          <code className="ml-1.5 text-[11px] text-gray-400">
                            {opt.value}
                          </code>
                          <span className="block text-xs text-gray-400">
                            {opt.desc}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* active */}
                <div className="flex items-center gap-3">
                  <Toggle
                    checked={form.active}
                    onChange={(next) => setForm({ ...form, active: next })}
                  />
                  <span className="text-sm text-gray-700">
                    有効{' '}
                    <span
                      className={
                        form.active ? 'text-blue-700 font-medium' : 'text-gray-400'
                      }
                    >
                      {form.active ? 'ON' : 'OFF'}
                    </span>
                  </span>
                </div>

                {formError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {formError}
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={closeForm}>
                    キャンセル
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-blue-600 hover:bg-blue-700 gap-1.5"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        保存中...
                      </>
                    ) : editingId ? (
                      '更新'
                    ) : (
                      '追加'
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* 一覧 */}
            {webhooks.length === 0 && !showForm ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-200 py-10 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                  <WebhookIcon className="h-6 w-6 text-gray-400" />
                </div>
                <p className="text-sm text-gray-600">
                  登録済みの Webhook はありません
                </p>
                <p className="mt-0.5 text-xs text-gray-400">
                  タスクの変更を外部サービスへ通知できます
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {webhooks.map((w) => {
                  const isTesting = testingId === w.id;
                  const msg = testMsg[w.id];
                  return (
                    <div
                      key={w.id}
                      className="rounded-lg border border-gray-200 bg-white p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            {w.label && (
                              <span className="font-medium text-gray-900">
                                {w.label}
                              </span>
                            )}
                            <span
                              className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium ${
                                w.active
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : 'border-gray-200 bg-gray-50 text-gray-500'
                              }`}
                            >
                              <Power className="h-3 w-3" />
                              {w.active ? '有効' : '無効'}
                            </span>
                            {w.hasSecret && (
                              <span className="inline-flex items-center gap-1 rounded border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">
                                <ShieldAlert className="h-3 w-3" />
                                署名あり
                              </span>
                            )}
                          </div>
                          <p className="mt-1 break-all font-mono text-sm text-gray-700">
                            {w.targetUrl}
                          </p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {w.events.length === 0 ? (
                              <span className="text-xs text-gray-400">
                                購読イベントなし
                              </span>
                            ) : (
                              w.events.map((e) => (
                                <span
                                  key={e}
                                  className="inline-flex items-center rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[11px] text-gray-600"
                                  title={e}
                                >
                                  {webhookEventLabel(e)}
                                </span>
                              ))
                            )}
                          </div>
                        </div>

                        <div className="flex flex-shrink-0 items-center gap-1">
                          <Toggle
                            checked={w.active}
                            onChange={() => handleToggleActive(w)}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleTest(w)}
                            disabled={isTesting}
                            className="ml-1 gap-1.5 border-gray-300 text-gray-700"
                            title="テスト配信を1件起票します"
                          >
                            {isTesting ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Send className="h-4 w-4" />
                            )}
                            テスト送信
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(w)}
                            className="h-9 w-9 p-0 text-gray-600"
                            title="編集"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(w)}
                            className="h-9 w-9 p-0 text-red-500 hover:bg-red-50 hover:text-red-600"
                            title="削除"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {msg && (
                        <div
                          className={`mt-3 flex items-start gap-2 rounded-lg border p-2.5 text-sm ${
                            msg.kind === 'ok'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                              : 'border-red-200 bg-red-50 text-red-700'
                          }`}
                        >
                          {msg.kind === 'ok' ? (
                            <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" />
                          ) : (
                            <X className="h-4 w-4 flex-shrink-0 mt-0.5" />
                          )}
                          <span className="break-all">{msg.text}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
