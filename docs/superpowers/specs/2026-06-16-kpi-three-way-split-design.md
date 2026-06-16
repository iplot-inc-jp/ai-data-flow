# 「AI作成」3分割（業務KPI / AI精度指標 / AI下書き）設計

作成日: 2026-06-16 / ブランチ: feat/methodology-pipeline / 承認済み（フロントのみ・バックエンド変更ゼロ）

## 確定事項
- 業務KPI（業務の目標）と AI精度指標（AIの精度）は**別物**。同一リストに**絶対に混ぜない**。
- 3独立ルート（タブではなくページ分離）。AI下書きの保存方式は**現状維持（生成＝即DRAFT着地）**。各手動画面に**フル手動作成フォームあり**。表記は **「AI精度指標」に統一**（内部値は `AI_QUALITY` のまま）。共有マスタ読込は **`use-kpi-masters.ts` フックに集約**。アイコン: 業務KPI=Goal / AI精度指標=Gauge / AI下書き=Sparkles。
- **バックエンド変更ゼロ**: `Kpi.category`(`BUSINESS`|`AI_QUALITY`) フィルタ・手動CRUD(`POST/PATCH/DELETE /kpis`,`PUT /kpis/:id/information-types`)・AI生成(`POST /kpis/generate`,`AI_KPI` ジョブ)はすべて既存。`kpiApi.list(projectId,{category})` も対応済み。

## ルーティング
| 画面 | ルート | category固定 | 役割 |
|---|---|---|---|
| 業務KPI | `[projectId]/business-kpi` | BUSINESS | 一覧・手動作成・編集・採用 |
| AI精度指標 | `[projectId]/ai-accuracy` | AI_QUALITY | 一覧・手動作成（プリセット含む）・編集・採用 |
| AI下書き | `[projectId]/ai-create`（ルート流用） | 入力UIで選択 | AI生成専用。出力DRAFTは種別に応じ上記へ着地 |

旧 `/ai-create` はリダイレクトせずルート流用し本体を「AI下書き」に書換。`ai-create/_components/*` は共有部品置き場として継続利用。

## ファイル別変更
**A. サイドバー** `frontend/src/app/(dashboard)/layout.tsx` — `'設計'` グループの `AI作成`(Sparkles) を3エントリへ置換: 業務KPI(`/business-kpi`,Goal) / AI精度指標(`/ai-accuracy`,Gauge) / AI下書き(`/ai-create`,Sparkles)。lucide import に `Goal`,`Gauge` 追加。

**B. 業務KPIページ（新規）** `…/business-kpi/page.tsx` — `'use client'`。マスタ読込は `use-kpi-masters` フック。`loadKpis`=`kpiApi.list(projectId,{category:'BUSINESS'})`。PageHeader「業務KPI」＋ `KpiList lockedCategory='BUSINESS'` ＋手動作成ボタン(KpiEditModal create・category固定)。AI生成タブ無し（AI下書きへの導線注記）。BackgroundJobsPanel 不要。

**C. AI精度指標ページ（新規）** `…/ai-accuracy/page.tsx` — B と同型、`category:'AI_QUALITY'`、`KpiList lockedCategory='AI_QUALITY'`。`ai-quality-kpi-tab.tsx` の `AI_QUALITY_PRESETS` 定数＋プリセット追加ロジック（`kpiApi.create({category:'AI_QUALITY',systemId,…,status:'DRAFT'})`＋IO紐づけ）を**この画面へ移設**。手動作成ボタン。

**D. AI下書きページ（既存書換）** `…/ai-create/page.tsx` — 役割を生成専用に。PageHeader「AI下書き」。既存2タブ(BusinessKpiTab/AiQualityKpiTab)を生成入力UIとして残す（AiQualityKpiTabはプリセット撤去後＝AI生成フォームのみ）。**ページ下部の共通 KpiList を撤去**。生成成功トーストに対応画面へのリンク導線。BackgroundJobsPanel は残す。生成は既存 `generateViaJob(...,{category})`→DRAFT。

**E. KpiList 改修** `…/ai-create/_components/kpi-list.tsx` — props に `lockedCategory?: KpiCategory` と `onCreateNew?: ()=>void`。`lockedCategory` 時は FILTERS ボタン群と counts を描画しない・空表示文言を画面別に。ヘッダ右に「＋手動で追加」。

**F. KpiEditModal create対応** `…/ai-create/_components/kpi-edit-modal.tsx` — `kpi: KpiDto | null` ＋ `lockedCategory?`。`kpi===null`→空フォーム＋`kpiApi.create`（save後 setInformationTypes の2段保存）、それ以外は従来 update。category セレクトは lockedCategory 時固定表示。

**G. AiQualityKpiTab スリム化** `…/ai-create/_components/ai-quality-kpi-tab.tsx` — プリセット定数/UI/ハンドラを C へ移動。残すは「システム選択＋任意フロー/IO＋AI生成フォーム」のみ。

**共有** `…/ai-create/_components/use-kpi-masters.ts`（新規）— flows/systems/roles/informationTypes 読込を3画面で共有。

**表記統一** `KPI_CATEGORY_LABELS` の 'AI精度KPI'→'AI精度指標'（kpi-format.tsx バッジ等に波及）。

**変更なし再利用**: kpi-format.tsx / flow-select.tsx / io-summary-table.tsx / business-kpi-tab.tsx / types.ts / lib/kpis.ts / backend 一式。

## データフロー
AI下書き(/ai-create): BusinessKpiTab→generate{BUSINESS}→DRAFT / AiQualityKpiTab→generate{AI_QUALITY}→DRAFT。同一 Kpi テーブルを category で区別 → 業務KPI画面 list{BUSINESS} / AI精度指標画面 list{AI_QUALITY} に自動的に並ぶ。混在経路は構造的に存在しない（サーバ絞り込み＋全カテゴリフィルタUI撤去）。

## リスク
- 表記統一('AI精度KPI'→'AI精度指標')はバッジへ波及、漏れなく。
- KpiEditModal の update専用前提を壊さない。create時は save後に setInformationTypes の2段保存。
- プリセット移設時に selectedIds/systemId/flowId 依存を取りこぼさない（IO紐づけ欠落防止）。
- 生成直後の同画面採用導線が変わる→対応画面へのリンクを明示。
- 新規2ルートの `'use client'`/useParams を既存 ai-create/page.tsx と揃える。
- タブ別 category 固定(BusinessKpiTab=BUSINESS / AiQualityKpiTab=AI_QUALITY)を維持。

## 検証
frontend tsc 0 / vitest / next build（/business-kpi・/ai-accuracy compiled）。backend 無改変。
