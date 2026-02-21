# UIタブ統一デザイン計画（Record / Stats / Cellar / Settings）

## 1. 目的

Cellar内サブタブ（Logs / Collections / Archives）で混在している見た目・見出しルールを整理し、
他タブ（Record / Stats / Settings）も含めて「同じアプリらしさ」を保つ。

- 実装しやすさ（段階導入）
- 既存操作性の維持（特にLogsの時系列閲覧）
- アクセシビリティ（見出し階層・操作一貫性）

を同時に満たすことを狙う。

---

## 2. 共通レイアウト原則（全タブ共通）

全タブを次の3層で設計する。

1. **Page Header層**
   - h2（タブ名）
   - 補助操作（ヘルプ、サブタブ切替）
2. **Section層**
   - h3（セクションタイトル）
   - 補助テキスト（任意）
   - 本文（カード群・リスト群）
3. **Item層**
   - `item-card`（情報ブロック）
   - `item-row`（時系列/一覧行）

> ポイント: 「カードかどうか」を画面ごとに揃えるのではなく、
> **Itemの役割で使い分ける**（情報=card、連続ログ=row）。

---

## 3. コンポーネント・トークン案

### 3.1 セクション外観

- セクションコンテナ: `glass-panel p-5 rounded-2xl`
- セクション間: `space-y-4`
- セクションタイトル: `text-sm font-bold`
- セクション補助文: `text-[11px] text-gray-500`

### 3.2 アイテム種類

- **item-card**
  - `rounded-2xl border shadow-sm p-4`
  - ランキング項目、アーカイブ項目、設定ブロック内のサブ項目に適用
- **item-row**
  - `rounded-2xl p-4 flex items-center gap-*`
  - ログ時系列など、連続閲覧向け

### 3.3 空状態テンプレ

空状態は以下テンプレに統一する。

- アイコン
- 主文（1行）
- 補助文（1行）

（Logs / Collections / Archives / Statsサブビューで共通化）

---

## 4. 画面別ワイヤー（テキスト）

## 4.1 Record（操作ダッシュボード型）

```text
[Page Header]
  Record  (?)

[Section: よく飲むビール]
  [shortcut chip] [shortcut chip] ...

[Section: いつもの運動]
  [shortcut chip] [shortcut chip] ...

[Section: 手入力]
  [Action Card: ビールを記録] [Action Card: 運動を記録]

[Section: コンディション&ツール]
  [Action Card: デイリーチェック] [Action Card: ストップウォッチ]
```

方針:
- Recordは「操作優先」なので全面glass化しない。
- ただしSection見出しルール（h3/余白/補助文）は統一する。

---

## 4.2 Stats（分析カード型）

```text
[Page Header]
  Stats               [Activity|Beer]

[Activity View]
  [Section Card: 活動カレンダー]
  [Section Card: カロリーバランス推移]
  [Section Card: ヘルスインサイト]

[Beer View]
  [Section Card: サマリー]
  [Section Card: スタイル内訳]
  [Section Card: ランキング/分布]
```

方針:
- 現行方針を基準デザインとして維持。
- CellarをStatsの「サブタブ + セクション」型へ寄せる。

---

## 4.3 Cellar（情報管理ハブ型）

```text
[Page Header]
  Cellar (?)          [Logs|Collections|Archives]

[Subtab: Logs]
  [Section Header: 記録一覧 + 補助説明 + 編集操作]
  [Date Group Label]
    [item-row]
    [item-row]
  [Date Group Label]
    [item-row]

[Subtab: Collections]
  [Section Card: ブルワリーランキング]
  [Section: マイビール]
    [Sticky Filter Bar]
    [item-card]
    [item-card]

[Subtab: Archives]
  [Section Header: 期間アーカイブ + 補助説明]
  [item-card]
  [item-card]
```

方針:
- **Logsのみrow型**を正式採用（使い勝手維持）。
- Collections / Archivesはcard型で揃える。
- 3サブタブすべてに「Section Header（h3 + 補助文）」を置いて統一感を作る。

---

## 4.4 Settings（設定カード型）

```text
[Page Header]
  Settings (?)

[Section Card: プロフィール]
  [input grid]

[Section Card: 環境設定]
  [select/input]

[Section Card: 通知]
  [toggle/list]

[Section Card: データ管理]
  [backup/restore/export/import]

[Section Card: このアプリについて]
  [guide] [feedback]
```

方針:
- 設定系UIの基準タブとして維持。
- 見出し階層は `h2(ページ) -> h3(各セクション)` に統一。

---

## 5. 実装優先順位（低リスク順）

## Phase 1: ルール整備（最小変更）

1. 見出し階層の統一（Settings内部 `h2 -> h3`）
2. セクション余白・タイトルサイズの統一
3. 空状態テンプレの統一

**狙い**: レイアウトを壊さず一貫性を先に作る。

## Phase 2: Cellarの骨格統一

1. LogsにSection Headerを導入（説明文 + 操作エリア整理）
2. ArchivesにSection Header + 空状態テンプレ適用
3. Collectionsの「ランキング」「マイビール」をSectionとして明示

**狙い**: ユーザーが「同じCellar内の別ビュー」と認識しやすくする。

## Phase 3: コンポーネント共通化

1. `section-title`, `item-card`, `item-row`, `empty-state` の共通クラス化
2. タブ切替ボタンの共通トークン化（Stats / Cellar）

**狙い**: 今後の改修コストを下げる。

## Phase 4: 視覚調整と微改善

1. sticky領域の高さ・境界線ルール統一
2. アイコンサイズ・補助ラベル（11px帯）の統一
3. ダークモードでのコントラスト最終調整

**狙い**: 体験品質の最終仕上げ。

---

## 6. 受け入れ基準（デザイン完了判定）

- すべてのタブで、ページ直下に「h2 + セクション群」の構造がある
- 各セクションの開始が視覚的に判別できる（タイトル/余白/背景）
- Cellarの3サブタブで、冒頭構造（見出し + 補助）が揃っている
- 空状態が同じパターンで表示される
- 既存主要操作（編集、一括削除、検索/フィルタ、バックアップ）が改悪なく利用できる

---

## 7. 補足（運用）

- まずは**クラス命名だけ先行**して、マークアップ改造は段階投入する。
- A/Bのような大きな見た目変更ではなく、**逐次統一**を採用する。
- スクリーンショット比較は「Cellar 3サブタブ + Stats + Settings」を固定観測点にする。
