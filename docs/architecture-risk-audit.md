# アーキテクチャ監査レポート v2（将来破綻リスク観点）

対象: `nomutore-v5-beta`
監査日: 2026-02-18
観点: 「今動くか」ではなく「将来どう壊れるか」
手法: 全ソースファイル（約13,500行）のライン単位レビュー

---

## 1. レイヤー構造の整合性

### 現状の依存関係マップ

```
main.js -------> Service, Store, UI, Timer, DataManager, CloudManager, Onboarding, ActionRouter

UI層 (ui/*)
  index.js ----> Service（直接呼び出し）, Store（直接参照）, Calc（logic.js）
  state.js ----> EventBus（通知発火のみ -- 循環依存は解消済み）
  rollover.js -> Service（直接呼び出し）, actionRouter, EventBus
  dom.js ------> constants のみ（独立性が高い）
  beerForm.js -> constants, logic.js（Calc）
  modal.js ----> Service, Store, dom.js

Service層
  service.js --> Store, LogService, Calc, StatusSyncService
  logService.js -> store.js (db)
  dataManager.js -> store.js (db), CloudManager, EventBus
  cloudManager.js -> （外部API のみ、内部依存なし）

Data層
  store.js ----> constants, dayjs
```

### 依存方向の逸脱箇所

| 箇所 | 問題 | 危険度 |
|------|------|--------|
| `ui/index.js:320` | UI層が `Service.saveBeerLog()` を直接呼び出し | 設計意図通り（許容） |
| `ui/index.js:66-67` | UI層が `Service.getAppDataSnapshot()` を直接呼び出し | 許容（データ取得は下方向） |
| `ui/rollover.js:11-24` | UI層が `Service.updatePeriodSettings()` / `Service.extendPeriod()` を直接呼び出し | 許容 |
| `ui/modal.js` -> `Service` | モーダルUIがService層を直接呼び出し | **注意**: 依存方向は正しいが結合度が高い |

**結論**: 依存方向自体は「UI -> Service -> Data」で概ね一貫している。ただし **UI層がService層の内部戻り値構造に強く依存** しており、Service APIの変更がUI層を広範に破壊するリスクがある。

### 循環依存の評価

旧レポートで指摘した `ui/state.js <-> ui/index.js` の循環依存は **現在のコードでは解消済み**。`state.js` は `EventBus.emit(Events.REFRESH_UI)` を使用しており、`ui/index.js` を直接 import していない（`state.js:55`）。

**残存リスク**: `ui/index.js` が `EventBus.on(Events.REFRESH_UI)` でリスナー登録（`ui/index.js:127`）し、`StateManager` の setter が同イベントを発火する。これは間接的な循環であり、setter -> emit -> refreshUI -> setter のような再帰パスが将来的に発生しうる。

---

## 2. Service層の責務過多

### 危険度A: `service.js` の God Object 化（即対応）

**現状**: `Service` オブジェクト（951行）が以下の責務を **すべて** 単一オブジェクトに集約。

| 責務カテゴリ | 該当メソッド | 行数 |
|---|---|---|
| CRUD操作 | `saveBeerLog`, `saveExerciseLog`, `saveDailyCheck`, `deleteLog`, `bulkDeleteLogs` | 約250行 |
| データ集約 | `getAppDataSnapshot`, `getCheckStatusForDate`, `getLogsWithPagination`, `getFrequent*`, `getRecent*` | 約180行 |
| ストリーク再計算 | `recalcImpactedHistory` | 約120行 |
| 期間管理 | `checkPeriodRollover`, `archiveAndReset`, `updatePeriodSettings`, `extendPeriod` | 約150行 |
| 設定保存 | `updateProfile`, `updateAppSettings` | 約30行 |
| ログ複製 | `repeatLog` | 約20行 |
| サーバー同期 | 各メソッド末尾の `StatusSyncService.syncLatestStatus()` | 各5行x5箇所 |

**なぜ危険か**:

1. **変更影響範囲の爆発**: `saveBeerLog` のビジネスロジック変更が、同ファイル内の `recalcImpactedHistory` に波及する。

2. **テスト不可能性**: `saveBeerLog`（`service.js:676-765`）は1メソッド内で以下を実行:
   - カロリー計算（`Calc.calculateBeerDebit`）
   - DB保存（`LogService.add` / `LogService.update`）
   - チェックレコードの休肝日解除（`db.checks.update`）
   - 重複チェックレコードの削除（`db.checks.bulkDelete`）
   - 履歴再計算（`recalcImpactedHistory`）
   - データスナップショット取得（`getAppDataSnapshot`）
   - サーバー同期（`StatusSyncService.syncLatestStatus`）
   単体テストには最低6つのモックが必要。

3. **具体的な破壊シナリオ**: 「ビール保存時にフレーバープロファイルのバリデーション追加」 -> `saveBeerLog` に条件分岐追加 -> 休肝日解除ロジック（`service.js:726-748`）との相互作用を検証する必要がある。

### 危険度B: 計算ロジックの散在（中期対応）

| ロジック | 箇所1 | 箇所2 | 差異リスク |
|---|---|---|---|
| 運動kcal計算 | `_calculateExerciseLogOutcome()` (service.js:39) | `Calc.getCurrentStreak()` 内フォールバック (logic.js:246) | METsデフォルト値が `6.0` vs `3.0` で不一致 |
| 日次バランス計算 | `getAppDataSnapshot()` の reduce (service.js:136) | `Calc.calculateBalance()` (logic.js:59) | 同一ロジックが別関数に存在 |
| 仮想日付判定 | `getVirtualDate()` (logic.js:18) | `ensureTodayCheckRecord` (service.js:206) | 同じ関数だが後続の変換パスが微妙に異なる |

**どう壊れるか**: `rolloverHour`（現在ハードコード `4`）を設定画面から可変にした場合、`getVirtualDate` は更新されても `ensureTodayCheckRecord` 内のタイムスタンプ範囲計算が追従しない。

---

## 3. グローバル状態・モジュールスコープ変数の危険性

### 危険度A: `save-beer` / `save-exercise` の連打ガード不足（即対応）

`ui/index.js` のモジュールスコープ変数:

```javascript
let _isSavingCheck = false;          // L156 -- チェック保存のガードあり
// しかし save-beer / save-exercise にはフラグガードが存在しない
```

`save-check` イベント（L430-456）は `_isSavingCheck` フラグでガードされているが、**`save-beer`（L308-370）と `save-exercise`（L373-426）にはフラグガードがない**。

ボタンの `disabled` 属性でガードしているが、`handleRepeat`（L984-1027）経由の `document.dispatchEvent(new CustomEvent('save-beer', ...))` では**ボタン要素が存在しない**ためガードが効かない。

**どう壊れるか**: リピートボタン連打 -> `save-beer` イベント複数回発火 -> `Service.saveBeerLog()` 並列実行 -> 同一タイムスタンプで重複ログ生成。

### 危険度B: `_isErrorCopyHandlerBound` の累積リスク（中期対応）

`ui/index.js:115-123`:
```javascript
EventBus.on(Events.ERROR_SHOW, ({ errText }) => {
    const copyBtn = document.getElementById('btn-copy-error');
    if (copyBtn && !_isErrorCopyHandlerBound) {
        _isErrorCopyHandlerBound = true;
        copyBtn.addEventListener('click', () => { ... });
    }
});
```

`UI.init()` の二重実行ガード（L283）はあるが、`EventBus` 自体に重複登録防止機構がない（`eventBus.js:22-25`）。HMR やテスト環境で `UI.init()` が再実行されると、全 EventBus リスナーが二重登録される。

### 危険度B: `Store._cachedData` のデッドコード化（中期対応）

`store.js:66-80`: `setCachedData` は `Service.getAppDataSnapshot()` (service.js:139) で毎回上書きされるが、`getCachedData()` を使用している箇所がコードベース内に**存在しない**。キャッシュは書き込まれるが読み出されておらず、将来誰かがこのキャッシュを信用して使用した場合、古いデータを返す。

### 危険度B: `window.__appInitState` のリカバリ不足（中期対応）

`main.js:266`: `initApp()` が例外で中断した場合、`catch` ブロック内で `IDLE` に戻す処理（L438）はあるが、`catch` に到達しない非同期例外（未処理 Promise rejection）の場合は `INITIALIZING` のままフリーズし、リロードまで復帰しない。

---

## 4. 非同期処理の競合リスク

### 危険度A: `recalcImpactedHistory` と連続保存の競合（即対応）

保存メソッドのコードパス:
```
saveBeerLog()
  -> await LogService.add(logData)           // DB書き込み1
  -> await Service.recalcImpactedHistory(ts)  // キュー経由DB更新2
  -> const { balance } = await Service.getAppDataSnapshot()  // DB読み取り3
  -> await StatusSyncService.syncLatestStatus(balance)        // サーバー送信4
```

`recalcImpactedHistory` は `_recalcQueue` で直列化されており（service.js:236）、`saveBeerLog` の `await` は正しくキュー完了を待つ。

**しかし**以下のシナリオで問題が発生:

1. ユーザーがビール保存 -> `saveBeerLog` A が `recalcImpactedHistory` を await 中
2. 同時に運動保存 -> `saveExerciseLog` B の `LogService.add()` が A の再計算完了前に実行
3. A の再計算は B のログを知らないまま完了
4. B の `recalcImpactedHistory` がキューの次に実行されるが、A の結果に基づく差分計算に不整合

**どう壊れるか**: 連続保存時にストリーク計算やアーカイブの `totalBalance` が一時的に不正確になる。次回の再計算で自己修復するが、その前に送信された `syncLatestStatus` のバランスは誤った値。

### 危険度B: `refreshUI()` の非ガード並列実行（中期対応）

`refreshUI()` (ui/index.js:186) は async 関数だが同時実行ガードがない。

```javascript
// ui/index.js:522 -- await なしで呼び出し
StateManager.setBeerMode(e.target.value);
refreshUI();

// state.js:55 -- EventBus経由でも
EventBus.emit(Events.REFRESH_UI);
// -> ui/index.js:128: setTimeout(() => refreshUI(), 50);
```

ユーザーが高速にタブ切替 -> ビアモード変更 -> ヒートマップ操作を行うと、3つの `refreshUI()` が並列実行。各呼び出しが `Store.setCachedData()` を上書きし、最後に完了したものが勝つ（race condition）。

---

## 5. Dexie（DB）スキーマ変更時の破壊リスク

### 危険度B: upgrade 関数の実質空実装（中期対応）

`store.js:26-33`:
```javascript
db.version(4).stores({ ... }).upgrade(tx => {
    // コメントのみ、処理なし
});
```

v3->v4 で追加された `isDryDay` フィールドが既存 `checks` レコードに存在しない。`service.js:737` で `primaryCheck.isDryDay` を参照するが、v3 時代のレコードでは `undefined`。JavaScript の falsy 評価で `false` 扱いになり現状は動くが、将来 `=== false` と `=== undefined` を区別するロジックが入ると破壊される。

### 危険度B: localStorage と DB version の二重管理（中期対応）

`store.js:83-113`:
```javascript
migrateV3ToV4: async () => {
    if (localStorage.getItem('v4_migration_complete')) return false;
    // ... localStorage 初期値設定 ...
    localStorage.setItem('v4_migration_complete', 'true');
}
```

**どう壊れるか**:
- IndexedDB を手動クリア -> Dexie が v1 から再作成 -> `v4_migration_complete` は localStorage に残る -> マイグレーションスキップ -> `PERIOD_MODE` 等のデフォルト値未設定
- 逆に localStorage クリア -> `v4_migration_complete` 消失 -> `migrateV3ToV4` 再実行 -> `PERIOD_START` が現在週頭に上書き -> カスタム期間消失

### 危険度C: バージョン番号の手動コピペ管理（長期改善）

v1-v5 が全て手動で `store.js` に列挙。v6 追加時にv5の定義をコピーする必要があり、コピー漏れでインデックスが消失するリスク。

---

## 6. Service Worker のキャッシュ整合性リスク

### 危険度B: CDN 依存によるオフライン完全不可（中期対応）

`service-worker.js:84`:
```javascript
if (url.origin !== location.origin) return;  // 他オリジンはSW対象外
```

これにより以下のCDNリソースはキャッシュされない:
- **dayjs** (cdn.jsdelivr.net) -- ほぼ全モジュールで import
- **canvas-confetti** (cdn.jsdelivr.net)
- **Chart.js** (cdn.jsdelivr.net)
- **Dexie** (unpkg.com) -- DB基盤
- **Google Fonts** (fonts.googleapis.com)
- **Phosphor Icons** (unpkg.com)

**どう壊れるか**: オフライン時に `dayjs` が読み込めず、`import dayjs from 'https://cdn.jsdelivr.net/...'` が失敗 -> ESM の import チェーンが全崩壊 -> アプリ白画面。`dayjs` は `store.js`, `logic.js`, `service.js`, `ui/index.js` 等で import されているため、**PWA のオフライン機能が事実上動作しない**。

### 危険度B: JS モジュールのプリキャッシュ不足（中期対応）

`service-worker.js:7-17` の `CORE_ASSETS` には `main.js` のみ含まれ、`main.js` が import する36個のモジュール（`service.js`, `store.js`, `ui/index.js` 等）はプリキャッシュされていない。SWR戦略で一度アクセスすればキャッシュされるが、**初回訪問直後のオフライン遷移で白画面**。

### 危険度C: `CACHE_VERSION` の手動更新（長期改善）

`service-worker.js:2`: `const CACHE_VERSION = 'v0.5.1-a4';`
コード更新時にバージョン更新を忘れると、新旧ファイルが混在する。ビルドツール未導入のため自動化手段なし。

---

## 7. 将来機能追加時に最も壊れやすい箇所 Top 5

### 第1位: `service.js` -- 保存系メソッド群（危険度A）

**該当**: `saveBeerLog` (L676-765), `saveExerciseLog` (L767-830), `saveDailyCheck` (L887-951)

**なぜ最も危険か**:
- 各メソッドが「DB保存 -> 副作用処理 -> 再計算 -> サーバー同期」の4段パイプラインを内包
- 新ログ種別（例: 食事記録）追加時、既存メソッドをコピーして `saveXxxLog` を作ることになる
- `recalcImpactedHistory` が全ログタイプを横断走査するため、新タイプ追加時にここも改修必要
- サーバー同期の `await StatusSyncService.syncLatestStatus(balance)` が各メソッド末尾にコピペ（DRY違反）

**破壊パターン**: 食事記録追加 -> `saveMealLog` 作成 -> `recalcImpactedHistory` の修正忘れ -> ストリーク計算が食事を無視 -> バランス不整合

### 第2位: `ui/index.js` -- 1,216行の巨大オーケストレーター（危険度A）

**なぜ危険か**:
- `UI.init()` (L281-866) が **585行** の単一メソッド
- `document.addEventListener` が8箇所、解除処理なし
- `refreshUI()` が5つのタブ状態を `if-else` 分岐。タブ追加時に全分岐を修正する必要

**破壊パターン**: 新タブ「食事」追加 -> `refreshUI()` に分岐追加 -> `switchTab()` のナビ制御にも追加 -> `gestures.js` のスワイプ対象タブ配列（L37）にも追加 -> どれか1つ忘れてスワイプで到達できないタブが発生

### 第3位: `recalcImpactedHistory` -- O(N x D) の全履歴走査（危険度A）

**該当**: `service.js:235-350`

**なぜ危険か**:
- 全ログ x 全日数のネストループ。ログ1000件/100日分で10万回イテレーション
- Dexie トランザクション内（L238）で実行、長時間ブロッキング
- データ量増加に比例してフリーズ

**破壊パターン**: 1年間毎日使用 -> ログ2000件 -> 365日分の再計算 -> 保存のたびに1-3秒フリーズ -> UX劣化

### 第4位: `service-worker.js` + CDN 依存（危険度B）

**なぜ危険か**:
- CDNリソースがキャッシュ対象外
- ESM の import が CDN URL 直接参照のため、CDN障害 = アプリ障害
- `CACHE_VERSION` の手動管理が運用事故の温床

**破壊パターン**: jsdelivr.net 一時ダウン -> dayjs 読み込み失敗 -> ESM import チェーン全崩壊 -> 白画面

### 第5位: `store.js` の Dexie バージョン管理（危険度B）

**なぜ危険か**:
- v6 追加時に v5 の `stores()` をコピペ。人為ミスが入りやすい
- `upgrade()` が空のため既存データのフィールド補完なし
- localStorage マイグレーションフラグが DB version と独立

**破壊パターン**: v6 で `checks` に `mood` フィールド追加 -> upgrade 未実装 -> 既存レコードの `mood` が `undefined` -> UI が `undefined.toString()` でクラッシュ

---

## 総合危険度マトリックス

### 危険度A（即対応 -- 次の機能追加で壊れうる）

| ID | 問題 | 箇所 | 影響 |
|----|------|------|------|
| A1 | Service層の God Object 化 | `service.js` 全体 (951行) | 変更影響範囲の爆発、テスト不可能 |
| A2 | `save-beer`/`save-exercise` の連打ガード不足 | `ui/index.js:308-426` | リピート機能経由での重複ログ生成 |
| A3 | `recalcImpactedHistory` の O(N x D) 計算量 | `service.js:235-350` | データ増加に比例するフリーズ |
| A4 | `recalcImpactedHistory` と保存処理の非同期競合 | `service.js:676-765, 767-830` | 連続保存時のバランス不整合 |

### 危険度B（中期対応 -- 3-6ヶ月以内に対処すべき）

| ID | 問題 | 箇所 | 影響 |
|----|------|------|------|
| B1 | CDN依存によるオフライン完全不可 | `service-worker.js:84` + 各CDN import | PWAの根幹機能が未実現 |
| B2 | JSモジュールのプリキャッシュ不足 | `service-worker.js:7-17` | 初回オフライン時の白画面 |
| B3 | DB version と localStorage migration の二重管理 | `store.js:83-113` | 部分クリア時のデータ不整合 |
| B4 | Dexie `upgrade()` の空実装 | `store.js:26-33` | 既存レコードのフィールド欠損 |
| B5 | `refreshUI()` の非ガード並列実行 | `ui/index.js:186` | 高速操作時の一時的表示不整合 |
| B6 | `Store._cachedData` のデッドコード化 | `store.js:66-80` | 将来の誤用リスク |
| B7 | 計算ロジック散在（METs デフォルト `3.0` vs `6.0`） | `logic.js:246` vs `service.js:40` | 計算結果の無音乖離 |

### 危険度C（長期改善 -- アーキテクチャ成熟に向けて）

| ID | 問題 | 箇所 | 影響 |
|----|------|------|------|
| C1 | `UI.init()` の 585行モノリス | `ui/index.js:281-866` | 新機能追加時の認知負荷 |
| C2 | `CACHE_VERSION` の手動管理 | `service-worker.js:2` | デプロイ時のキャッシュ不整合 |
| C3 | Dexie バージョンのコピペ列挙 | `store.js:9-42` | v6+ 追加時の人為ミス |
| C4 | EventBus の重複登録防止機構なし | `eventBus.js:22-25` | テスト/HMR環境での副作用累積 |
| C5 | `gestures.js` のタブ配列ハードコード | `gestures.js:37` | タブ追加時の更新漏れ |

---

## 推奨アクション（優先順）

### 即時（A対応）

1. **`service.js` の責務分割**: `SaveService`（CRUD+副作用）、`RecalcService`（ストリーク再計算）、`PeriodService`（期間管理+アーカイブ）、`QueryService`（データ取得）の4つに分離。各保存メソッド末尾の `syncLatestStatus` をパイプライン最終段として統一。

2. **連打ガードの統一**: `save-beer`/`save-exercise` イベントリスナーに `_isSavingBeer`/`_isSavingExercise` フラグを追加。または `CustomEvent` ベースのイベントを廃止し直接関数呼び出しに統一。

3. **`recalcImpactedHistory` の差分計算化**: 変更日以降の**運動ログのみ**を対象にし全日走査を回避。アーカイブ更新は保存処理から分離して遅延実行。

### 中期（B対応）

4. **CDN依存の解消**: `dayjs`, `Chart.js`, `Dexie`, `confetti` をローカルバンドル化（`npm install` + `import` に移行）。または Service Worker で CDN レスポンスもキャッシュ対象にする。

5. **マイグレーション戦略の一元化**: `v4_migration_complete` を廃止し、DB version ベースの upgrade 関数で localStorage 初期値設定も実行。

6. **`refreshUI()` の実行制御**: debounce（最後の呼び出しから100ms後に実行）を導入し並列実行を防止。

### 長期（C対応）

7. **`UI.init()` の分割**: イベント登録を `setupSaveListeners()`, `setupNavigationListeners()`, `setupFormListeners()` に分離。

8. **ビルドパイプライン導入**: Vite 等を導入し、`CACHE_VERSION` の自動生成、CDN依存のバンドル化、モジュール分割の最適化を実現。

9. **EventBus への `once()` / 重複防止の追加**: `on()` に同一コールバックの重複チェック、または `off()` -> `on()` パターンの標準化。
