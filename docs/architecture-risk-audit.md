# アーキテクチャ監査レポート（将来破綻リスク観点）

対象: `nomutore-v5-beta`
観点: 「今動くか」ではなく「将来壊れやすいか」

## 危険度A（即対応）

### A1. レイヤー循環依存（UI内部）
- **なぜ危険か**: `ui/index.js` が `ui/state.js` を import し、同時に `ui/state.js` が `refreshUI` を得るため `ui/index.js` を import しており、循環依存が成立しています。初期化順や bundler 最適化の影響を受ける構造です。
- **どう壊れるか**:
  - ESM評価順のズレで `refreshUI` が未初期化参照になり、特定端末・ビルド条件だけでクラッシュ。
  - 状態更新 (`StateManager._notify`) から `refreshUI()` が直接呼ばれるため、将来 `refreshUI` の依存が増えると「状態変更で別状態が書き換わる」再帰的バグが発生。
- **証跡**: `ui/state.js` が `refreshUI` を直接 import し `_notify` で実行。`ui/index.js` は `StateManager` を import。 

### A2. Service層の責務過多（ドメイン計算 + DB I/O + UI用メッセージ生成 + 外部同期）
- **なぜ危険か**: `Service` が永続化、ストリーク再計算、シェア文言生成、通知サーバー同期まで一体化。変更時の影響範囲が巨大で、単体検証困難です。
- **どう壊れるか**:
  - 例: シェア仕様変更だけで保存ロジックが壊れる。
  - 例: 通知同期失敗が保存処理のタイミングに影響し、操作レスポンス劣化・部分失敗を誘発。
  - 例: `recalcImpactedHistory` が重くなると全保存系（beer/exercise/check/delete）が連鎖して遅延。
- **証跡**: `saveBeerLog` / `saveExerciseLog` / `saveDailyCheck` が DB更新→再計算→同期→UI向け payload 生成まで担当。

### A3. 非同期競合（再計算キューと別系統更新の整合性）
- **なぜ危険か**: `recalcImpactedHistory` は `_recalcQueue` で直列化している一方、周辺の `localStorage` 書き込みや `_syncStatusToServer()` は同一トランザクション境界外。整合点が分散しています。
- **どう壊れるか**:
  - 連打保存時に、再計算完了順とサーバー同期時点がズレて「最新でない balance」を送信。
  - 後続機能で `Service` メソッドが増えると、キュー非経由更新が混入して結果が飛ぶ。
- **証跡**: `_recalcQueue` は `recalcImpactedHistory` のみ対象。`_syncStatusToServer` は各保存メソッド末尾で個別 fire-and-forget 実行。

### A4. Service Workerのキャッシュ不整合リスク（手動プリキャッシュ配列）
- **なぜ危険か**: `APP_SHELL` を手動列挙しており、新規ファイル/分割chunkを追加したときに配列更新漏れが起きやすい。さらに CDN依存資産は SW 対象外で一貫性が崩れます。
- **どう壊れるか**:
  - 新機能追加後、オフライン時だけ画面崩壊（必要JS未キャッシュ）。
  - 一部だけ旧JSが残り、`main.js` と `ui/*` のバージョン組み合わせが不整合化。
- **証跡**: `CACHE_NAME` の手動運用 + `APP_SHELL` 固定列挙 + 同一オリジン以外 fetch 除外。

## 危険度B（中期対応）

### B1. Data層にUI責務が混入
- **なぜ危険か**: `DataManager.restoreFromObject` が `confirm` を直接呼び、UI確認フローを内包。Data層の再利用性・自動テスト性を下げます。
- **どう壊れるか**:
  - UI変更（モーダル化）時に DataManager 全体改修が必要。
  - 将来バックグラウンド復元（自動復元）を追加する際、対話API依存が障害に。

### B2. グローバル状態の再初期化耐性不足
- **なぜ危険か**: `window._isAppInitialized`、`Store._cachedData`、`_lastHomeRenderKey` 等のモジュールスコープ状態が多く、HMR/部分再初期化/タブ復帰で破綻しやすい。
- **どう壊れるか**:
  - 一度例外で初期化途中停止すると `window._isAppInitialized=true` のまま再試行不可。
  - キャッシュキーが実データ更新を取りこぼし、再描画されない幽霊バグ。

### B3. イベント多重登録の温床
- **なぜ危険か**: `setupEventBusListeners` の中で `ERROR_SHOW` 発火ごとに `btn-copy-error` へ `click` を追加登録。解除がありません。
- **どう壊れるか**:
  - エラー表示を繰り返すほど1クリックで複数回コピー実行。
  - 長時間稼働でメモリリーク・予期せぬ副作用。

### B4. 計算ロジック重複
- **なぜ危険か**: 運動kcal計算が保存時（`saveExerciseLog`）と履歴再計算時（`recalcImpactedHistory`）で別フロー実装。丸め・memo規則の差分混入が起きやすい。
- **どう壊れるか**:
  - 将来係数変更時に片方だけ更新され、再計算後に値が「勝手に変わる」。

## 危険度C（長期改善）

### C1. Dexie migration設計の不十分さ
- **なぜ危険か**: v1→v5 定義はあるが、`upgrade` が実質空で、実データ変換戦略（既存値補完・整合検証）が不足。さらに `v4_migration_complete` が localStorage 依存でDB versionと独立管理。
- **どう壊れるか**:
  - DBが更新されたのに localStorage フラグ不一致で二重/未実施マイグレーション。
  - スキーマ追加時、古いレコードの欠損値で新機能側が想定外分岐。

### C2. レイヤー境界の曖昧さ（「UI都合データ」をServiceが返す）
- **なぜ危険か**: Serviceが `shareAction` などUIアクション表現を返却。プレゼンテーション都合がドメイン層へ侵入しています。
- **どう壊れるか**:
  - UI仕様変更（SNS追加/文言変更）でServiceインターフェイスが頻繁に破壊。

## 7. 将来機能追加時に最も壊れやすい箇所 Top 5

1. **`Service.recalcImpactedHistory` 周辺**
   - 理由: 全ログ走査・日次ループ・アーカイブ更新を抱える中核ホットパス。データ量増で性能と整合性が同時に悪化。
2. **`ui/index.js` の巨大初期化ブロック**
   - 理由: イベント配線・保存処理・描画制御が密集し、1変更で副作用範囲が広い。
3. **`ui/state.js` ↔ `ui/index.js` 循環依存点**
   - 理由: 状態層と描画層の境界が崩れており、機能追加時に再帰更新/初期化順バグを誘発。
4. **`service-worker.js` の手動キャッシュ定義**
   - 理由: ファイル追加時の更新漏れが運用事故になりやすい。
5. **`store.js` の Dexie version + localStorage migration併用部**
   - 理由: DB schema version とアプリ設定migrationの責務分離が曖昧で、バージョン進化時に破壊的齟齬が出やすい。

## 推奨アクション（優先順）
1. **即時**: `ui/state.js` から `refreshUI` 直接呼び出しを除去し、EventBus通知のみに統一。
2. **即時**: Serviceを `CommandService`（保存/削除）・`RecalcService`・`SyncService` に分割。
3. **中期**: DataManagerの対話要素（confirm）をUI層へ移譲。
4. **中期**: 再計算結果の送信をジョブ化し、`_syncStatusToServer` をキュー後段へ統合。
5. **長期**: Dexie migrationを「DB version基準」のみで運用し、検証付きupgrade関数を各versionで定義。
