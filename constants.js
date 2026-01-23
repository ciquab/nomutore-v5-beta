export const APP = {
    STORAGE_KEYS: {
        LOGS: 'hazy_payback_logs', 
        CHECKS: 'hazy_payback_checks', 
        WEIGHT: 'hazy_payback_weight', 
        HEIGHT: 'hazy_payback_height', 
        AGE: 'hazy_payback_age', 
        GENDER: 'hazy_payback_gender', 
        TIMER_START: 'hazy_payback_timer_start',
        TIMER_ACCUMULATED: 'hazy_payback_timer_accumulated',
        MODE1: 'hazy_payback_mode_1', 
        MODE2: 'hazy_payback_mode_2',
        BASE_EXERCISE: 'hazy_payback_base_exercise',
        THEME: 'hazy_payback_theme',
        DEFAULT_RECORD_EXERCISE: 'hazy_payback_default_record_exercise',
        
        PERIOD_MODE: 'hazy_payback_balance_mode',
        PERIOD_START: 'hazy_payback_period_start',
        PERIOD_DURATION: 'hazy_payback_period_duration',
        CHECK_SCHEMA: 'hazy_payback_check_schema',
        ORB_STYLE: 'hazy_payback_orb_style',
        UNIT_MODE: 'hazy_payback_unit_mode',
        PROFILE: 'hazy_payback_profile'
    },
    DEFAULTS: { 
        WEIGHT: 60, HEIGHT: 160, AGE: 30, GENDER: 'female', 
        MODE1: '国産ピルスナー', MODE2: 'Hazy IPA',
        BASE_EXERCISE: 'walking',
        THEME: 'system',
        DEFAULT_RECORD_EXERCISE: 'walking',
        PERIOD_MODE: 'weekly',
        PERIOD_DURATION: 14,
        ORB_STYLE: 'lager',
        UNIT_MODE: 'kcal'
    },
    TANK_MAX_CANS: 3.0,
    HASHTAGS: '#NOMUTORE #飲んだら動く' // SNSシェア用
};

// --- Daily Check Library & Presets (Phase 1.5) ---

// 【重要】初期状態のスキーマ定義（復活させました）
export const CHECK_SCHEMA = [
    { id: 'waistEase', label: '腹周りの余裕', icon: '👖', type: 'boolean', desc: 'ベルトやズボンがきつくない' },
    { id: 'footLightness', label: '足取りが軽い', icon: '🦶', type: 'boolean', desc: 'むくみや重さを感じない' },
    { id: 'waterOk', label: 'チェイサー', icon: '💧', type: 'boolean', desc: 'お酒と同量の水を飲んだ', drinking_only: true },
    { id: 'fiberOk', label: '飲酒前繊維', icon: '🥦', type: 'boolean', desc: '飲む前に食物繊維をとった', drinking_only: true }
];

// 項目ライブラリから初期選択されるID（内部ロジック用）
export const CHECK_DEFAULT_IDS = ['waistEase', 'footLightness', 'waterOk', 'fiberOk'];

// 項目ライブラリ（カテゴリー別）
export const CHECK_LIBRARY = {
    general: [
        { id: 'waistEase', label: '腹周りの余裕', icon: '👖', desc: 'ベルトやズボンがきつくない' },
        { id: 'footLightness', label: '足取りが軽い', icon: '🦶', desc: 'むくみや重さを感じない' },
        { id: 'sleepQuality', label: '睡眠の質', icon: '💤', desc: '朝スッキリ起きられた' },
        { id: 'mood', label: '気分が良い', icon: '✨', desc: 'ストレスを感じていない' }
    ],
    diet: [
        { id: 'noSnack', label: '間食抜き', icon: '🈲', desc: 'お菓子・つまみを我慢した' },
        { id: 'vegeFirst', label: 'ベジファースト', icon: '🥗', desc: '野菜から先に食べた' },
        { id: 'proteinOk', label: 'タンパク質', icon: '🍗', desc: '体重x1g以上摂取した' },
        { id: 'calorieLimit', label: '腹八分目', icon: '🍽️', desc: '食べ過ぎなかった' }
    ],
    alcohol: [
        { id: 'waterOk', label: 'チェイサー', icon: '💧', desc: 'お酒と同量の水を飲んだ', drinking_only: true },
        { id: 'fiberOk', label: '飲酒前繊維', icon: '🥦', desc: '飲む前に食物繊維をとった', drinking_only: true },
        { id: 'supplement', label: 'サプリ摂取', icon: '💊', desc: 'ウコン/ヘパリーゼ等を飲んだ', drinking_only: true },
        { id: 'finishTime', label: '早めの切り上げ', icon: '🕙', desc: '寝る2時間前に飲み終えた', drinking_only: true }
    ],
    muscle: [
        { id: 'musclePain', label: '筋肉痛あり', icon: '💥', desc: '良いトレーニングができた' },
        { id: 'stretch', label: 'ストレッチ', icon: '🧘', desc: '運動前後のケアをした' },
        { id: 'stepsGoal', label: '歩数達成', icon: '👟', desc: '目標歩数を超えた' }
    ]
};

// プリセット定義
export const CHECK_PRESETS = {
    'default': { label: '基本セット', icon: '🔰', ids: ['waistEase', 'footLightness', 'waterOk', 'fiberOk'] },
    'diet': { label: 'ガチダイエット', icon: '📉', ids: ['waistEase', 'noSnack', 'vegeFirst', 'calorieLimit', 'fiberOk'] },
    'muscle': { label: '筋トレ・ボディメイク', icon: '💪', ids: ['proteinOk', 'musclePain', 'sleepQuality', 'waterOk'] },
    'liver': { label: '肝臓いたわり', icon: '🏥', ids: ['waterOk', 'fiberOk', 'supplement', 'finishTime', 'sleepQuality'] }
};

export const CALORIES = { 
    STYLES: { 
        '国産ピルスナー': 145,
        '糖質オフ/新ジャンル': 110,
        'ピルスナー': 140,
        'ドルトムンター': 145,
        'シュバルツ': 155,
        'ゴールデンエール': 150,
        'ペールエール': 160,
        'ジャパニーズエール': 160,
        'ヴァイツェン': 180,
        'ベルジャンホワイト': 160,
        'セゾン': 165,
        'セッションIPA': 130,
        'IPA (West Coast)': 190,
        'Hazy IPA': 220,
        'Hazyペールエール': 170,
        'ダブルIPA (DIPA)': 270,
        'アンバーエール': 165,
        'ポーター': 170,
        'スタウト': 200,
        'インペリアルスタウト': 280,
        'ベルジャン・トリペル': 250,
        'バーレイワイン': 320,
        'サワーエール': 140,
        'フルーツビール': 160,
        'ノンアル': 50,
    } 
};

export const BEER_COLORS = {
    'pale': 'linear-gradient(to top, #fde047, #fef08a)',
    'gold': 'linear-gradient(to top, #eab308, #facc15)',
    'copper': 'linear-gradient(to top, #d97706, #fbbf24)',
    'amber': 'linear-gradient(to top, #b45309, #d97706)',
    'black': 'linear-gradient(to top, #000000, #4b2c20)',
    'white': 'linear-gradient(to top, #fcd34d, #fef3c7)',
    'hazy': 'linear-gradient(to top, #ca8a04, #facc15)',
    'red': 'linear-gradient(to top, #991b1b, #ef4444)',
    'green': 'linear-gradient(to top, #86efac, #bbf7d0)'
};

export const STYLE_METADATA = {
    '国産ピルスナー': { color: 'gold', icon: '🍺' },
    '糖質オフ/新ジャンル': { color: 'pale', icon: '🍺' },
    'ピルスナー': { color: 'gold', icon: '🍺' },
    'ドルトムンター': { color: 'gold', icon: '🍺' },
    'シュバルツ': { color: 'black', icon: '🍺' },
    'アンバーエール': { color: 'amber', icon: '🍺' },
    'ゴールデンエール': { color: 'gold', icon: '🍺' },
    'ペールエール': { color: 'copper', icon: '🍺' },
    'ジャパニーズエール': { color: 'copper', icon: '🍺' },
    'ヴァイツェン': { color: 'white', icon: '🥛' },
    'ベルジャンホワイト': { color: 'white', icon: '🥛' },
    'セゾン': { color: 'white', icon: '🥂' },
    'セッションIPA': { color: 'copper', icon: '🍺' },
    'IPA (West Coast)': { color: 'copper', icon: '🍺' },
    'Hazy IPA': { color: 'hazy', icon: '🍹' },
    'Hazyペールエール': { color: 'hazy', icon: '🍹' },
    'ダブルIPA (DIPA)': { color: 'copper', icon: '🍺' },
    'ポーター': { color: 'black', icon: '☕' },
    'スタウト': { color: 'black', icon: '☕' },
    'インペリアルスタウト': { color: 'black', icon: '☕' },
    'ベルジャン・トリペル': { color: 'gold', icon: '🍷' },
    'バーレイワイン': { color: 'amber', icon: '🍷' },
    'サワーエール': { color: 'red', icon: '🍷' },
    'フルーツビール': { color: 'red', icon: '🍒' },
    'ノンアル': { color: 'green', icon: '🍃' },
};

export const STYLE_COLOR_MAP = {};
Object.keys(CALORIES.STYLES).forEach(style => {
    STYLE_COLOR_MAP[style] = STYLE_METADATA[style] ? STYLE_METADATA[style].color : 'gold';
});

export const EXERCISE = {
    // 1. ビアギークの基本（最強の動機づけ）
    'beer_walk': { label: 'ビア散歩 (飲みに行く)', mets: 3.5, icon: '🍺' },
    
    // 2. 自宅マシン（制作者様推奨：動画見ながらOK）
    'stepper': { label: 'ステッパー (自宅)', mets: 6.0, icon: '👣' },
    'cycling': { label: 'エアロバイク・自転車', mets: 4.0, icon: '🚲' }, // 軽い負荷を想定

    // 3. 生活・ながら運動
    'walking': { label: '通勤・徒歩移動', mets: 3.5, icon: '🚶' },
    'gaming': { label: 'フィットネスゲーム', mets: 4.0, icon: '🎮' },
    'housework': { label: '家事・掃除・育児', mets: 3.3, icon: '🧹' }, 
    
    // 4. メンテナンス
    'stretch': { label: 'ストレッチ・ヨガ', mets: 2.5, icon: '🧘' },
    
    // 5. 少し頑張る時
    'brisk_walking': { label: '早歩き・急ぎ移動', mets: 4.5, icon: '👟' },
    'training': { label: '筋トレ (自重・ジム)', mets: 5.0, icon: '💪' },
    
    // 6. ガチ勢向け（優先度低）
    'running': { label: 'ランニング', mets: 7.0, icon: '🏃' },
    'hiit': { label: 'HIIT (高強度)', mets: 8.0, icon: '🔥' }
};

export const SIZE_DATA = { '350': { label: '350ml (缶)', ratio: 1.0 }, '500': { label: '500ml (ロング缶)', ratio: 1.43 }, '473': { label: '473ml (USパイント)', ratio: 1.35 }, '568': { label: '568ml (UKパイント)', ratio: 1.62 }, '250': { label: '250ml (小グラス)', ratio: 0.71 }, '1000': { label: '1L (マース)', ratio: 2.86 } };

export const ALCOHOL_CONSTANTS = {
    ETHANOL_DENSITY: 0.789,
    CARB_CALORIES: 4.0
};

export const STYLE_SPECS = {
    'ラガー': { abv: 5.0, carb: 3.5 },
    'エール': { abv: 5.5, carb: 3.8 },
    'ピルスナー': { abv: 5.0, carb: 3.2 },
    '黒ビール': { abv: 5.0, carb: 4.2 },
    'IPA (West Coast)': { abv: 6.5, carb: 3.8 },
    'Hazy IPA': { abv: 7.0, carb: 4.5 },
    'セッションIPA': { abv: 4.5, carb: 3.0 },
    'ダブルIPA': { abv: 8.0, carb: 5.0 },
    'ペールエール': { abv: 5.0, carb: 3.0 },
    'アンバーエール': { abv: 5.5, carb: 3.6 },
    'ポーター': { abv: 5.5, carb: 4.0 },
    'スタウト': { abv: 6.0, carb: 4.5 },
    'インペリアルスタウト': { abv: 9.0, carb: 5.5 },
    'ベルジャン・トリペル': { abv: 8.5, carb: 4.5 },
    'バーレイワイン': { abv: 10.0, carb: 6.0 },
    'サワーエール': { abv: 5.0, carb: 3.5 },
    'フルーツビール': { abv: 5.0, carb: 5.0 }, 
    'ノンアル': { abv: 0.0, carb: 2.0 }, 
    'Custom': { abv: 5.0, carb: 3.0 } 
};