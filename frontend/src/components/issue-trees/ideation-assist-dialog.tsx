'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { HelpTooltip } from '@/components/ui/help-tooltip';
import {
  Lightbulb,
  Target,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Sparkles,
  Check,
  AlertCircle,
  Settings,
  Wand2,
} from 'lucide-react';
import {
  IDEATION_METHODS,
  getIdeationMethod,
  type IdeationMethod,
  type IdeationDefaultKind,
} from '@/lib/ideation-methods';
import { KIND_CONFIG, type IssueNodeKind } from '@/lib/issue-tree-patterns';

type AddNodeKind = 'CAUSE' | 'COUNTERMEASURE';

/** AIが返す子ノード候補（ai-suggest と同形） */
export type AiSuggestion = { label: string; kind: IssueNodeKind };

/** チェックリストの1候補（編集可能・追加削除可能） */
type Candidate = {
  id: string;
  text: string;
  checked: boolean;
};

/** AI具体化で返ってきた候補（採用チェック付き） */
type AiCandidate = AiSuggestion & { id: string; checked: boolean };

let candidateSeq = 0;
const nextCandidateId = () => `cand-${candidateSeq++}`;
let aiCandidateSeq = 0;
const nextAiCandidateId = () => `ai-cand-${aiCandidateSeq++}`;

/**
 * 発想法による子ノード分解ダイアログ。
 *
 * Step1: 発想法を選ぶ（name + purpose + 症状/trigger を提示。任意でサジェスト）
 * Step2: その法の lenses をチェックリスト化（prompt 事前入力・編集/追加/削除可）。原因/打ち手をトグル。
 * Step3: 「ツリーに追加」でチェック済み候補を選択ノードの子ノードとして既存 API で作成。
 */
export function IdeationAssistDialog({
  open,
  onOpenChange,
  parentId,
  parentLabel,
  treeType,
  suggestMethodKey,
  onAdd,
  treeId,
  onAiSuggest,
  onAdoptAi,
  settingsHref = '/dashboard/settings',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 親（選択中）ノード ID。ルート直下は null */
  parentId: string | null;
  /** 親ノードのラベル（見出し表示用） */
  parentLabel: string;
  treeType: 'WHY' | 'SOLUTION';
  /** 任意: おすすめの発想法 key */
  suggestMethodKey?: string;
  /**
   * チェック済み候補を子ノードとして一括追加する。
   * @returns 追加が成功したか
   */
  onAdd: (
    parentId: string | null,
    kind: AddNodeKind,
    labels: string[],
  ) => Promise<boolean>;
  /** 課題ツリー ID（AI具体化の呼び出しに使用） */
  treeId?: string;
  /**
   * 発想法レンズ文脈つきで AI 子ノード候補を取得する。
   * 未指定なら「AIで具体化」ボタンは表示しない。
   * @returns { ok, suggestions, keyMissing, message }
   *   keyMissing=true は鍵未設定（400）で、UI は設定導線に切り替える。
   */
  onAiSuggest?: (args: {
    nodeId: string;
    ideationMethodName: string;
    ideationLenses: string[];
    context?: string;
  }) => Promise<{
    ok: boolean;
    suggestions: AiSuggestion[];
    keyMissing: boolean;
    message?: string;
  }>;
  /**
   * AI候補（label,kind）をその種別のまま子ノードとして採用する。
   * 未指定なら onAdd を使ってフォールバックする。
   * @returns 追加が成功したか
   */
  onAdoptAi?: (
    parentId: string | null,
    items: AiSuggestion[],
  ) => Promise<boolean>;
  /** AI鍵設定への導線 */
  settingsHref?: string;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [methodKey, setMethodKey] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [kind, setKind] = useState<AddNodeKind>('CAUSE');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── AI具体化（任意） ───────────────────────────────
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAdopting, setAiAdopting] = useState(false);
  const [aiCandidates, setAiCandidates] = useState<AiCandidate[]>([]);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiKeyMissing, setAiKeyMissing] = useState(false);
  const [aiFetched, setAiFetched] = useState(false);
  /** AI具体化が使えるか（コールバックと treeId と対象ノードが揃っているか） */
  const aiEnabled = Boolean(onAiSuggest && treeId && parentId);

  const resetAi = () => {
    setAiLoading(false);
    setAiAdopting(false);
    setAiCandidates([]);
    setAiError(null);
    setAiKeyMissing(false);
    setAiFetched(false);
  };

  const method: IdeationMethod | undefined = methodKey
    ? getIdeationMethod(methodKey)
    : undefined;

  // ダイアログを開くたびに初期化
  useEffect(() => {
    if (open) {
      setStep(1);
      setMethodKey(null);
      setCandidates([]);
      setError(null);
      setSubmitting(false);
      resetAi();
      // WHY ツリーは原因、SOLUTION ツリーは打ち手をデフォルトに
      setKind(treeType === 'SOLUTION' ? 'COUNTERMEASURE' : 'CAUSE');
    }
  }, [open, treeType]);

  // 発想法を選んだら lenses を候補へ展開し、既定種別をセット
  const selectMethod = (m: IdeationMethod) => {
    setMethodKey(m.key);
    setCandidates(
      m.lenses.map((l) => ({
        id: nextCandidateId(),
        text: l.prompt,
        checked: true,
      })),
    );
    setKind(resolveDefaultKind(m.defaultKind, treeType));
    setError(null);
    resetAi();
    setStep(2);
  };

  const checkedCount = useMemo(
    () => candidates.filter((c) => c.checked && c.text.trim()).length,
    [candidates],
  );

  const updateCandidate = (id: string, patch: Partial<Candidate>) =>
    setCandidates((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const removeCandidate = (id: string) =>
    setCandidates((cs) => cs.filter((c) => c.id !== id));

  const addCandidate = () =>
    setCandidates((cs) => [
      ...cs,
      { id: nextCandidateId(), text: '', checked: true },
    ]);

  const handleSubmit = async () => {
    const labels = candidates
      .filter((c) => c.checked)
      .map((c) => c.text.trim())
      .filter(Boolean);
    if (labels.length === 0) {
      setError('追加する候補を1つ以上チェックしてください。');
      return;
    }
    setSubmitting(true);
    setError(null);
    const ok = await onAdd(parentId, kind, labels);
    setSubmitting(false);
    if (ok) {
      onOpenChange(false);
    } else {
      setError('子ノードの追加に失敗しました。時間をおいて再度お試しください。');
    }
  };

  // チェック中のレンズ（candidates の text）と発想法名で AI 具体化を実行
  const runAiSuggest = async () => {
    if (!onAiSuggest || !parentId || !method) return;
    const lenses = candidates
      .filter((c) => c.checked)
      .map((c) => c.text.trim())
      .filter(Boolean);
    if (lenses.length === 0) {
      setAiError('AIに渡すレンズを1つ以上チェックしてください。');
      return;
    }
    setAiLoading(true);
    setAiError(null);
    setAiKeyMissing(false);
    const res = await onAiSuggest({
      nodeId: parentId,
      ideationMethodName: method.name,
      ideationLenses: lenses,
    });
    setAiLoading(false);
    setAiFetched(true);
    if (!res.ok) {
      setAiKeyMissing(res.keyMissing);
      setAiError(
        res.keyMissing
          ? 'AIの鍵が未設定です。設定からAI鍵を登録すると具体化が使えます。'
          : res.message || 'AIによる具体化に失敗しました。時間をおいて再度お試しください。',
      );
      setAiCandidates([]);
      return;
    }
    setAiCandidates(
      res.suggestions.map((s) => ({ ...s, id: nextAiCandidateId(), checked: true })),
    );
  };

  const toggleAiCandidate = (id: string) =>
    setAiCandidates((cs) =>
      cs.map((c) => (c.id === id ? { ...c, checked: !c.checked } : c)),
    );

  const aiCheckedCount = useMemo(
    () => aiCandidates.filter((c) => c.checked && c.label.trim()).length,
    [aiCandidates],
  );

  // AI候補のうちチェック済みを、バックエンドが返した kind のまま子ノード化
  const handleAdoptAi = async () => {
    const items: AiSuggestion[] = aiCandidates
      .filter((c) => c.checked && c.label.trim())
      .map((c) => ({ label: c.label.trim(), kind: c.kind }));
    if (items.length === 0) {
      setAiError('採用する候補を1つ以上チェックしてください。');
      return;
    }
    setAiAdopting(true);
    setAiError(null);
    let ok: boolean;
    if (onAdoptAi) {
      // kind を保ったまま採用（推奨）
      ok = await onAdoptAi(parentId, items);
    } else {
      // フォールバック: onAdd は CAUSE/COUNTERMEASURE のみ受けるので種別ごとにまとめる
      const causeLabels = items
        .filter((it) => it.kind !== 'COUNTERMEASURE')
        .map((it) => it.label);
      const counterLabels = items
        .filter((it) => it.kind === 'COUNTERMEASURE')
        .map((it) => it.label);
      ok = true;
      if (causeLabels.length > 0 && !(await onAdd(parentId, 'CAUSE', causeLabels))) {
        ok = false;
      }
      if (
        counterLabels.length > 0 &&
        !(await onAdd(parentId, 'COUNTERMEASURE', counterLabels))
      ) {
        ok = false;
      }
    }
    setAiAdopting(false);
    if (ok) {
      onOpenChange(false);
    } else {
      setAiError('子ノードの追加に失敗しました。時間をおいて再度お試しください。');
    }
  };

  const aiBusy = aiLoading || aiAdopting;

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="bg-white sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-blue-600" />
            発想法で分解
          </DialogTitle>
          <DialogDescription>
            「{parentLabel || 'ルートの問い'}」を、IPLoT 発想法のレンズで子ノード候補に分解します。
            {step === 1
              ? ' まず、いまの行き詰まりに合う発想法を選んでください。'
              : ' チェックした候補を子ノードとしてツリーに追加します。'}
          </DialogDescription>
        </DialogHeader>

        {/* ステップインジケータ */}
        <div className="flex items-center gap-2 text-xs">
          <StepBadge active={step === 1} done={step > 1} index={1} label="発想法を選ぶ" />
          <span className="text-gray-300">→</span>
          <StepBadge active={step === 2} done={false} index={2} label="候補を選んで追加" />
        </div>

        {/* Step 1: 発想法選択 */}
        {step === 1 && (
          <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {suggestMethodKey && getIdeationMethod(suggestMethodKey) && (
              <p className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                おすすめ:{' '}
                <span className="font-semibold">
                  {getIdeationMethod(suggestMethodKey)!.name}
                </span>
              </p>
            )}
            {IDEATION_METHODS.map((m) => {
              const suggested = m.key === suggestMethodKey;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => selectMethod(m)}
                  className={`block w-full rounded-lg border p-3 text-left transition hover:border-blue-400 hover:bg-blue-50/40 ${
                    suggested ? 'border-blue-400 bg-blue-50/40' : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-gray-900">{m.name}</span>
                    <span
                      className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium ${
                        m.defaultKind === 'COUNTERMEASURE'
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                          : 'border-blue-300 bg-blue-50 text-blue-700'
                      }`}
                    >
                      {m.defaultKind === 'COUNTERMEASURE' ? '打ち手寄り' : '原因寄り'}
                    </span>
                  </div>
                  <p className="mt-1 flex items-start gap-1.5 text-[11px] font-medium text-amber-700">
                    <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                    こんな時に: {m.trigger}
                  </p>
                  <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-gray-500">
                    {m.purpose}
                  </p>
                </button>
              );
            })}
          </div>
        )}

        {/* Step 2: レンズのチェックリスト */}
        {step === 2 && method && (
          <div className="space-y-3">
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <div className="text-sm font-semibold text-gray-900">{method.name}</div>
              <p className="mt-0.5 line-clamp-2 text-[11px] text-gray-500">{method.purpose}</p>
            </div>

            {/* 原因 / 打ち手トグル */}
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-xs font-medium text-gray-500">
                追加する種別
                <HelpTooltip text="原因（なぜ型のレンズ）か打ち手（解決策型のレンズ）かを選びます。発想法ごとに推奨の種別を初期選択しています。" />
              </span>
              <div className="flex gap-1">
                <KindToggle
                  active={kind === 'CAUSE'}
                  onClick={() => setKind('CAUSE')}
                  icon={<Lightbulb className="h-3 w-3" />}
                  label="原因"
                  activeCls="bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-300"
                />
                <KindToggle
                  active={kind === 'COUNTERMEASURE'}
                  onClick={() => setKind('COUNTERMEASURE')}
                  icon={<Target className="h-3 w-3" />}
                  label="打ち手"
                  activeCls="bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-300"
                />
              </div>
            </div>

            {/* 候補チェックリスト */}
            <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
              {candidates.map((c, i) => {
                const lensLabel = method.lenses[i]?.label;
                return (
                  <div
                    key={c.id}
                    className={`rounded-lg border p-2 transition ${
                      c.checked ? 'border-blue-200 bg-blue-50/30' : 'border-gray-200 bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        onClick={() => updateCandidate(c.id, { checked: !c.checked })}
                        aria-pressed={c.checked}
                        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                          c.checked
                            ? 'border-blue-600 bg-blue-600 text-white'
                            : 'border-gray-300 bg-white text-transparent'
                        }`}
                      >
                        <Check className="h-3 w-3" />
                      </button>
                      <div className="min-w-0 flex-1">
                        {lensLabel && (
                          <div className="mb-1 text-[10px] font-semibold text-gray-400">
                            {lensLabel}
                          </div>
                        )}
                        <Textarea
                          value={c.text}
                          onChange={(e) => updateCandidate(c.id, { text: e.target.value })}
                          rows={2}
                          placeholder="子ノードにする内容を入力"
                          className="resize-none text-xs"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeCandidate(c.id)}
                        className="mt-0.5 shrink-0 rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500"
                        title="この候補を削除"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={addCandidate}
                className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 py-2 text-xs text-gray-500 hover:border-blue-300 hover:bg-blue-50/30 hover:text-blue-600"
              >
                <Plus className="h-3.5 w-3.5" />
                候補を追加
              </button>
            </div>

            {/* ✨ AIで具体化（任意） */}
            {onAiSuggest && (
              <div className="space-y-2 rounded-lg border border-violet-200 bg-violet-50/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Wand2 className="h-4 w-4 text-violet-600" />
                    <span className="text-xs font-semibold text-violet-800">
                      AIで具体化
                    </span>
                    <HelpTooltip text="チェック中のレンズと発想法名をAIに渡し、対象ノードに対する具体的で実行可能な子ノード候補を起案させます。返った候補はチェックして採用できます。" />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={runAiSuggest}
                    disabled={aiBusy || aiKeyMissing || !aiEnabled || checkedCount === 0}
                    className="bg-violet-600 hover:bg-violet-700"
                  >
                    {aiLoading ? (
                      <>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        生成中…
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                        AIで具体化
                      </>
                    )}
                  </Button>
                </div>

                {!aiEnabled && !aiKeyMissing && (
                  <p className="text-[11px] text-violet-700/80">
                    {parentId
                      ? 'AIによる具体化は現在ご利用いただけません。'
                      : 'ルート直下では対象ノードが無いためAI具体化は使えません。'}
                  </p>
                )}

                {aiKeyMissing ? (
                  <div className="flex flex-col items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-center">
                    <AlertCircle className="h-5 w-5 text-amber-500" />
                    <p className="text-[11px] text-amber-800">
                      AIの鍵が未設定です。設定からAI鍵を登録すると具体化が使えます。
                    </p>
                    <Link href={settingsHref}>
                      <Button size="sm" variant="outline" className="gap-1.5 text-amber-700">
                        <Settings className="h-3.5 w-3.5" />
                        設定でAI鍵を登録
                      </Button>
                    </Link>
                  </div>
                ) : aiLoading ? (
                  <div className="flex h-[80px] flex-col items-center justify-center gap-1.5 text-xs text-violet-600">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    AIが候補を生成しています…
                  </div>
                ) : aiCandidates.length > 0 ? (
                  <>
                    <ul className="max-h-[200px] space-y-1.5 overflow-y-auto pr-1">
                      {aiCandidates.map((c) => {
                        const kc = KIND_CONFIG[c.kind];
                        return (
                          <li key={c.id}>
                            <button
                              type="button"
                              onClick={() => toggleAiCandidate(c.id)}
                              aria-pressed={c.checked}
                              className={`flex w-full items-start gap-2 rounded-lg border p-2 text-left transition ${
                                c.checked
                                  ? 'border-violet-300 bg-white'
                                  : 'border-gray-200 bg-white/60 hover:bg-white'
                              }`}
                            >
                              <span
                                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                                  c.checked
                                    ? 'border-violet-600 bg-violet-600 text-white'
                                    : 'border-gray-300 bg-white text-transparent'
                                }`}
                              >
                                <Check className="h-3 w-3" />
                              </span>
                              <span className="min-w-0 flex-1 text-xs text-gray-800">
                                {c.label}
                              </span>
                              {kc && (
                                <span
                                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${kc.chip}`}
                                >
                                  {kc.label}
                                </span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleAdoptAi}
                        disabled={aiBusy || aiCheckedCount === 0}
                        className="bg-violet-600 hover:bg-violet-700"
                      >
                        {aiAdopting ? (
                          <>
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            採用中…
                          </>
                        ) : (
                          <>
                            <Check className="mr-1.5 h-3.5 w-3.5" />
                            AI候補を採用（{aiCheckedCount}件）
                          </>
                        )}
                      </Button>
                    </div>
                  </>
                ) : aiFetched ? (
                  <p className="text-[11px] text-violet-700/80">
                    AI候補が得られませんでした。レンズを見直して再度お試しください。
                  </p>
                ) : (
                  <p className="text-[11px] text-violet-700/80">
                    チェック中のレンズ（{checkedCount}件）を使ってAIに具体的な子候補を起案させます。
                  </p>
                )}

                {aiError && !aiKeyMissing && (
                  <div className="flex items-center gap-2 rounded border border-red-200 bg-red-50 p-2 text-[11px] text-red-700">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {aiError}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
          {step === 2 ? (
            <Button
              variant="outline"
              onClick={() => setStep(1)}
              disabled={submitting}
              className="text-gray-600"
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              発想法を選び直す
            </Button>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              キャンセル
            </Button>
            {step === 2 && (
              <Button
                onClick={handleSubmit}
                disabled={submitting || checkedCount === 0}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    追加中...
                  </>
                ) : (
                  <>
                    ツリーに追加（{checkedCount}件）
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </>
                )}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 発想法の既定種別とツリー種別から実際の追加種別を解決 */
function resolveDefaultKind(
  methodDefault: IdeationDefaultKind,
  treeType: 'WHY' | 'SOLUTION',
): AddNodeKind {
  // WHY ツリーは原因深掘りが主目的なので、原因寄りの法では CAUSE を優先
  if (treeType === 'WHY' && methodDefault === 'CAUSE') return 'CAUSE';
  return methodDefault;
}

function StepBadge({
  active,
  done,
  index,
  label,
}: {
  active: boolean;
  done: boolean;
  index: number;
  label: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ${
        active
          ? 'bg-blue-600 text-white'
          : done
            ? 'bg-blue-50 text-blue-700'
            : 'bg-gray-100 text-gray-400'
      }`}
    >
      <span
        className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
          active ? 'bg-white text-blue-600' : done ? 'bg-blue-600 text-white' : 'bg-gray-300 text-white'
        }`}
      >
        {done ? <Check className="h-2.5 w-2.5" /> : index}
      </span>
      {label}
    </span>
  );
}

function KindToggle({
  active,
  onClick,
  icon,
  label,
  activeCls,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  activeCls: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded border px-2.5 py-1 text-xs font-medium transition ${
        active ? `border-transparent ${activeCls}` : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
