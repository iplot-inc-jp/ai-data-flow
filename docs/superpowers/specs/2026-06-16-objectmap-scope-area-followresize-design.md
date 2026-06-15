# オブジェクト関係性マップ「囲い(SCOPE)=領域」メンバー保持＋追従リサイズ 設計

作成日: 2026-06-16 / ブランチ: feat/methodology-pipeline

## 背景・目的（ユーザー要望）
- 囲い(SCOPE)を**ちゃんとリサイズ**できるように（既存手動リサイズの不具合があれば修正）。
- **囲ってるものをデータ構造(DB)に入れておく**。
- **中のものを動かしたら囲いのサイズも変更**（追従）。
- **「囲い」は領域(SubProject)であるべき**。

確定方針（AskUserQuestion）: 対象=**オブジェクト関係性マップのみ** / 追従=**手動サイズ＋はみ出したら拡大（縮小は手動）**。

## 核となる設計：囲い ＝ 領域(SubProject)
「囲い」は `DataObjectAnnotation(kind=SCOPE)` で、既に `subProjectId`（領域）を持てる。**囲い＝領域**とし、メンバーシップは既存の仕組みを正とする：
- **メンバー = `DataObject.subProjectId == SCOPE.subProjectId`**（その領域に属するオブジェクト）。
- 既存 `applyScopeLinks`（POST data-object-annotations/:id/apply-scope-links）= 囲み矩形に**中心が含まれる**オブジェクトを `subProjectId` でその領域に紐付け。これが「データ構造(DB)に入れておく」の実体。**新スキーマ不要**。

## 振る舞い（フロント：ObjectMapCanvas / page.tsx）
オブジェクト移動確定（`onObjectMoved(id,x,y)`）時に、既存の位置保存に加えて：
1. **領域編入**: 領域付き SCOPE のうち、オブジェクト**中心** `(x+CARD_W/2, y+CARD_H/2)` を含むものを探す。見つかり、かつ `object.subProjectId !== scope.subProjectId` なら、そのオブジェクトを当該領域に紐付け（既存 `linkObjectToSubProject` + 楽観更新）。
2. **はみ出し拡大**: 中心がその SCOPE 内にあるオブジェクトの**カード矩形** `[x, x+CARD_W]×[y, y+CARD_H]` が SCOPE 矩形をはみ出すなら、SCOPE の `positionX/Y/width/height` を**拡大して内包**（+余白 PAD=16）。**縮小はしない**（手動のみ）。既存 `handleScopeGeometryChanged`（楽観更新＋デバウンス保存＋applyScopeLinks）で永続。
   - 中心が SCOPE 外に出たオブジェクトは（その SCOPE の）メンバー判定外＝囲いは追わない（暴走拡大の防止）。
3. **手動リサイズ**: 既存の SCOPE 手動リサイズ（move/resize の scopeDragRef）を確認し、最小サイズ・はみ出し描画・ハンドル等に不具合があれば修正。

実装上の注意（TDZ回避）: 追従ロジックは `handleScopeGeometryChanged`/`linkObjectToSubProject` 等を参照するため、それらより**後**に定義した `applyScopeMembershipOnMove(id,x,y)` を JSX の `onObjectMoved` で `handleObjectMoved` と合成して呼ぶ（`onObjectMoved={(id,x,y)=>{handleObjectMoved(id,x,y); void applyScopeMembershipOnMove(id,x,y)}}`）。

## スコープ外（YAGNI）
- 業務フロー/DFD の囲み（今回はオブジェクトマップのみ）。
- 自動縮小。新スキーマ（memberObjectIds 等は不要＝subProject 所属を正とする）。
- 1オブジェクト＝1領域（複数領域所属は不可。既存 subProjectId 単一の通り）。

## 検証
frontend tsc/vitest/build、backend 変更なし。ライブ smoke: オブジェクトを囲い内へ移動→領域に紐付く＋囲い端へ寄せると囲いが拡大、手動リサイズ可。
