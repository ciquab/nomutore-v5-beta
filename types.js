/**
 * ============================================================================
 * NOMUTORE Type Definitions (JSDoc)
 * ============================================================================
 * このファイルはランタイム（実行時）には何もしませんが、
 * VSCodeなどのエディタに型情報を提供し、開発体験と安全性を向上させます。
 */

/**
 * ユーザープロフィール情報
 * @typedef {Object} Profile
 * @property {number} weight - 体重 (kg)
 * @property {number} height - 身長 (cm)
 * @property {number} age - 年齢
 * @property {string} gender - 性別 ('male' | 'female')
 */

/**
 * 飲酒・運動ログ (Logs Table)
 * @typedef {Object} Log
 * @property {number} [id] - Dexieの自動採番ID (新規作成時は未定義)
 * @property {number} timestamp - 記録日時 (Unix Timestamp ms)
 * @property {'beer' | 'exercise'} type - 記録タイプ
 * @property {string} [name] - 表示名 (例: "Yona Yona Ale", "Walking")
 * @property {number} [kcal] - カロリー収支 (飲酒はマイナス、運動はプラス)
 * * // --- Beer Specific ---
 * @property {string} [style] - ビールのスタイル (beerのみ, 例: "IPA")
 * @property {number} [count] - 本数/セット数 (beerのみ)
 * @property {number} [abv] - アルコール度数
 * @property {number} [ml] - 容量(ml)
 * @property {string} [size] - サイズ表記 (例: "350")
 * @property {string} [brewery] - 醸造所名 (beerのみ)
 * @property {string} [brand] - 銘柄名 (beerのみ)
 * @property {number} [rating] - ビール評価 1-5 (beerのみ)
 * @property {string} [untappd_query] - Untappd検索用クエリ
 * @property {boolean} [isCustom] - カスタム入力フラグ
 * @property {string} [customType] - カスタムタイプ ('dry' | 'sweet' etc)
 * * // --- Exercise Specific ---
 * @property {string} [exerciseKey] - 運動マスタのキー (例: "walk", "run")
 * @property {number} [minutes] - 運動時間 (exerciseのみ)
 * @property {number} [rawMinutes] - ボーナス計算前の元の運動時間 (exerciseのみ)
 * * // --- Common ---
 * @property {string} [memo] - 任意のメモ
 * * // --- Flavor Profile (v5) ---
 * @property {FlavorProfile} [flavorProfile] - 味わいプロファイル (beerのみ)
 */

/**
 * 味わいプロファイル（レーダーチャート用）
 * 各軸は 0-5 の整数、未入力は null
 * @typedef {Object} FlavorProfile
 * @property {number|null} bitterness - 苦味 (0=なし, 5=非常に強い)
 * @property {number|null} sweetness - 甘味⇔ドライ (0=ドライ, 5=甘い)
 * @property {number|null} fruity - フルーティー (0=なし, 5=非常にフルーティー)
 * @property {number|null} body - ボディ (0=ライト, 5=フル)
 */

/**
 * デイリーチェック/体調記録 (Checks Table)
 * @typedef {{
 * id?: number;
 * timestamp: number;
 * date?: string; // フォーム入力用 (YYYY-MM-DD)
 * isDryDay: boolean;
 * weight?: number | string; // DBはnumberだがフォーム入力中はstring
 * isSaved?: boolean;
 * * // デフォルト項目（補完用）
 * waistEase?: boolean;
 * footLightness?: boolean;
 * fiberOk?: boolean;
 * waterOk?: boolean;
 * * // カスタム項目対応 (Index Signature)
 * [key: string]: boolean | string | number | null | undefined;
 * }} Check
 */

/**
 * チェック項目のスキーマ定義 (Constants)
 * @typedef {Object} CheckSchemaItem
 * @property {string} id - 項目ID
 * @property {string} label - 表示ラベル
 * @property {string} icon - アイコンクラスまたは絵文字
 * @property {string} [desc] - 説明文
 * @property {boolean} [drinking_only] - 飲酒日のみ表示するか
 * @property {'state' | 'action' | 'training'} [metricType] - 分析カテゴリ
 * @property {string} [type] - データ型 ('boolean' 等)
 */

/**
 * 期間アーカイブ (Archives Table) - v4新機能
 * @typedef {Object} Archive
 * @property {number} [id]
 * @property {number} startDate - 開始日 (ms)
 * @property {number} endDate - 終了日 (ms)
 * @property {string} mode - 集計モード ('weekly' 等)
 * @property {number} totalBalance - 期間中の最終収支
 * @property {number} totalDays - 期間日数
 * @property {number} dryDays - 休肝日日数
 * @property {Log[]} [logs] - 期間中のログのスナップショット
 */

/**
 * ビールスタイルの定義マスタ
 * @typedef {Object} StyleSpec
 * @property {number} abv - アルコール度数 (%)
 * @property {number} carb - 糖質 (g/100ml)
 */

// このファイルをモジュールとして認識させるため、空のexportを行います
export {};
