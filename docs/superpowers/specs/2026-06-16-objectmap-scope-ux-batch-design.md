# オブジェクト関係性マップ 囲い(領域) UX 改善バッチ 設計

作成日: 2026-06-16 / ブランチ: feat/methodology-pipeline

## 背景・目的（ユーザー要望 4件）
1. **領域(囲い)を移動したら内包オブジェクトも一緒に移動**。
2. **領域の中に入ってるオブジェクトが見られる一覧画面**（置き場所＝object-map 内サイドパネル・確定）。
3. **囲いも Backspace/Delete で削除**できるように。
4. **Backspace/移動後の「諸々の反映」が遅すぎる**を改善（最重要）。

## ④ 反映を速く（最重要・全体方針）
現状はほぼ全ての操作後に `await refresh()`（グラフ全体再取得）しており、削除・移動・領域編入の反映が遅い。**楽観更新（ローカル state 即時反映）に統一し、保存はバックグラウンド・成功時の全体 refresh() は廃止**する（失敗時のみ refresh で巻き戻し）。
- `handleDeleteObject`: 該当オブジェクト＋それに接続する relation をローカルから即除去 → 裏で deleteObject。refresh しない。
- `handleDeleteRelation`: 該当 relation を即除去 → 裏で deleteRelation。
- `handleDeleteScope`: 該当 annotation を即除去 → 裏で削除。
- `handleScopeGeometryChanged` の applyScopeLinks 後の `refresh()`: 領域編入は**ローカルで楽観反映**（内側オブジェクトの subProjectId をローカル更新）し、サーバ applyScopeLinks は裏で実行・refresh しない。
- 追加/作成系（オブジェクト/関係）も可能な範囲で作成レスポンスを state に push（既に created を使える所は refresh 廃止）。失敗時のみ refresh。

## ① 領域移動で内包オブジェクトも一緒に移動（ObjectMapCanvas）
囲い(SCOPE)の **move**（`handleScopePointerDown(... 'move')`）時：
- ドラッグ開始時に「中心が囲み矩形内」のオブジェクト ID とその基準位置を snapshot（members）。
- onMove 中、members の `dragPos` を base+delta で更新 → 囲いと一緒に視覚移動。
- onUp で、囲い geometry を `onScopeGeometryChanged`、各 member を `onObjectMoved(id, newX, newY)` で確定（楽観＋保存）。
- resize 時は members を動かさない（サイズだけ）。

## ② 領域→内包オブジェクト 一覧パネル（object-map 内）
object-map ページに開閉できるサイドパネル（または既存パネル群に1セクション）を追加：
- 領域(SCOPE で subProjectId 設定済み、または SubProject マスタ)ごとに、**内包オブジェクト（subProjectId 一致）**を一覧。
- 各行クリックでそのオブジェクトを選択/フォーカス（既存 setSelectedObjectId / フォーカス導線を流用）。
- 未所属（subProjectId=null）オブジェクトのグループも表示。
- データはローカル state（graph.objects ＋ annotations/subProjects）から算出（追加 API 不要）。

## ③ 囲い(SCOPE) も Backspace/Delete 削除（ObjectMapCanvas）
既存の矢印 Backspace 削除に加え、**選択中の囲い(`selectedScopeId`)** があれば Backspace/Delete で `onDeleteScope` を呼ぶ。優先順位: 矢印(edgeEdit) → 囲い(selectedScope)。テキスト入力中は無視。

## スコープ外（YAGNI）
- 業務フロー/DFD の囲み（object-map のみ）。
- 新スキーマ（既存 DataObject.subProjectId / DataObjectAnnotation を使用）。
- 一覧パネルの並べ替え/フィルタの作り込み（最小一覧）。

## 検証
frontend tsc/vitest/build、backend 変更なし。ライブ smoke: 削除/移動が即反映（refetch 待ちなし）・囲い移動で中身も動く・囲い Backspace 削除・一覧パネルに領域×内包が出る。
