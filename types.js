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
 * @property {string} name - 表示名 (例: "Yona Yona Ale", "Walking")
 * @property {number} kcal - カロリー収支 (飲酒はマイナス、運動はプラス)
 * @property {string} [style] - ビールのスタイル (beerのみ, 例: "IPA")
 * @property {number} [count] - 本数/セット数 (beerのみ)
 * @property {number} [minutes] - 運動時間 (exerciseのみ)
 * @property {number} [rawMinutes] - ボーナス計算前の元の運動時間 (exerciseのみ)
 * @property {string} [memo] - 任意のメモ
 * @property {number} [rating] - ビール評価 1-5 (beerのみ)
 * @property {string} [brewery] - 醸造所名 (beerのみ)
 * @property {string} [untappd_query] - Untappd検索用クエリ
 * @property {boolean} [isCustom] - カスタム入力フラグ
 * @property {string} [exerciseKey] - 運動マスタのキー (例: "walk", "run")
 */

/**
 * デイリーチェック/体調記録 (Checks Table)
 * @typedef {Object} Check
 * @property {number} [id] - Dexieの自動採番ID
 * @property {number} timestamp - 記録日時 (Unix Timestamp ms)
 * @property {boolean} isDryDay - 休肝日フラグ
 * @property {number} [weight] - その日の体重
 * @property {boolean} [waistEase] - お腹周りのスッキリ感
 * @property {boolean} [footLightness] - 足取りの軽さ
 * @property {boolean} [fiberOk] - お通じ
 * @property {boolean} [waterOk] - 水分摂取
 * @property {boolean} [isSaved] - 保存ボタンが押された確定データかどうか
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
