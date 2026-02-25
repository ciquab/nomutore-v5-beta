// @ts-check
import { driver } from "https://cdn.jsdelivr.net/npm/driver.js@1.0.1/dist/driver.js.mjs";
import { APP, CALORIES } from '../constants.js';
import { StateManager } from './state.js';
import { Feedback, showConfetti, showMessage, showAppShell } from './dom.js';
import { DataManager } from '../dataManager.js';

let currentStepIndex = 0;
const FIRST_RECORD_INTENT_KEY = 'nomutore_first_record_intent';
const MANDATORY_TOUR_RUNNING_KEY = 'nomutore_mandatory_tour_running';
const POST_TOUR_GO_RECORD_KEY = 'nomutore_post_tour_go_record';


const DETAILED_TOUR_STEPS = {
    home: [
        {
            element: '.orb-container',
            popover: {
                title: 'Homeの見方',
                description: '中央のオーブで、飲酒カロリーと運動消費の収支を一目で確認できます。',
                side: 'bottom',
                align: 'center'
            }
        },
        {
            element: '#liver-rank-card',
            popover: {
                title: 'LiverRank',
                description: '記録の傾向から現在のコンディション目安を表示します。',
                side: 'bottom',
                align: 'center'
            }
        },
        {
            element: '#check-status',
            popover: {
                title: 'CheckStatus',
                description: 'デイリーチェックの達成状況を確認できます。',
                side: 'bottom',
                align: 'center'
            }
        }
    ],
    record: [
        {
            element: '#record-manual-input',
            popover: {
                title: 'Recordの使い方',
                description: 'ここからビール記録・運動記録・デイリーチェックを開始できます。',
                side: 'top',
                align: 'center'
            }
        },
        {
            element: '#btn-record-beer',
            popover: {
                title: 'ビールを記録',
                description: '飲んだ内容を記録します。必要に応じて詳細入力も可能です。',
                side: 'top',
                align: 'center'
            }
        },
        {
            element: '#btn-record-exercise',
            popover: {
                title: '運動を記録',
                description: '運動種目と時間を入力して、消費カロリーを反映します。',
                side: 'top',
                align: 'center'
            }
        },
        {
            element: '#btn-record-check',
            popover: {
                title: 'デイリーチェック',
                description: '体重や体調を毎日記録すると、変化の振り返りに役立ちます。',
                side: 'top',
                align: 'center'
            }
        }
    ],
    stats: [
        {
            element: '#tab-stats',
            popover: {
                title: 'Statsの使い方',
                description: '飲酒・運動・チェック傾向を期間別に分析できます。',
                side: 'top',
                align: 'center'
            }
        }
    ],
    cellar: [
        {
            element: '#tab-cellar',
            popover: {
                title: 'Cellarの使い方',
                description: 'Logsで履歴、Collectionsで銘柄別の集計を確認できます。',
                side: 'top',
                align: 'center'
            }
        }
    ],
    settings: [
        {
            element: '#tab-settings',
            popover: {
                title: 'Settingsの使い方',
                description: 'プロフィール、期間設定、バックアップなどをここで管理します。',
                side: 'top',
                align: 'center'
            }
        },
        {
            element: '#btn-save-settings',
            popover: {
                title: '保存',
                description: '設定変更後は保存ボタンで反映してください。',
                side: 'top',
                align: 'center'
            }
        }
    ]
};

const MANDATORY_TOUR_STEPS = [
    {
        element: '#beer-select-display',
        popover: {
            title: 'Home（収支の確認）',
            description: 'このオーブ周辺で、飲酒と運動の収支を確認できます。<br>まずは「今どういう状態か」をここで見ます。',
            side: 'bottom',
            align: 'center'
        }
    },
    {
        element: '#nav-tab-record',
        popover: {
            title: 'Record（最初の1件を記録）',
            description: 'ビール/運動の記録はここから開始します。<br>デイリーチェックもこのタブから入力できます。',
            side: 'top',
            align: 'center'
        }
    },
    {
        element: '.orb-container',
        popover: {
            title: '反映結果（Homeオーブ）',
            description: '記録すると、このオーブの表示が更新されます。<br>履歴の詳細確認は Cellar > Logs から行えます。',
            side: 'bottom',
            align: 'center'
        }
    }
];

/* ==========================================================================
   Phase A: Initial Setup (Wizard Steps)
   ========================================================================== */


const applyDeferredProfileDefaults = () => {
    localStorage.setItem(APP.STORAGE_KEYS.WEIGHT, String(APP.DEFAULTS.WEIGHT));
    localStorage.setItem(APP.STORAGE_KEYS.HEIGHT, String(APP.DEFAULTS.HEIGHT));
    localStorage.setItem(APP.STORAGE_KEYS.AGE, String(APP.DEFAULTS.AGE));
    localStorage.setItem(APP.STORAGE_KEYS.GENDER, APP.DEFAULTS.GENDER);
    localStorage.setItem('nomutore_profile_deferred', 'true');
};

const WIZARD_STEPS = [
    {
        id: 'step-welcome',
        title: 'ようこそ',
        desc: '開始方法を選択してください。',
        render: () => `
            <div class="space-y-4">
                <div class="grid grid-cols-1 gap-2">
                    <button data-action="onboarding:start-new" data-intent="beer"
                            class="w-full p-4 bg-indigo-50 dark:bg-indigo-900/30 border-2 border-indigo-200 dark:border-indigo-800 rounded-2xl text-left group hover:border-indigo-500 transition-all">
                        <div class="flex items-center gap-4">
                            <div class="w-12 h-12 bg-brand text-white rounded-full flex items-center justify-center text-xl">
                                <i class="ph-fill ph-beer-bottle" aria-hidden="true"></i>
                            </div>
                            <div>
                                <div class="font-black text-base-900 dark:text-white">ビールを先に記録したい</div>
                                <div class="text-[11px] text-gray-500">プロフィールは後で設定できます</div>
                            </div>
                        </div>
                    </button>

                    <button data-action="onboarding:start-new" data-intent="exercise"
                            class="w-full p-4 bg-white dark:bg-base-800 border-2 border-gray-100 dark:border-gray-700 rounded-2xl text-left group hover:border-indigo-300 transition-all">
                        <div class="flex items-center gap-4">
                            <div class="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/40 text-brand rounded-full flex items-center justify-center text-xl">
                                <i class="ph-fill ph-person-simple-run" aria-hidden="true"></i>
                            </div>
                            <div>
                                <div class="font-black text-base-900 dark:text-white">運動を先に記録したい</div>
                                <div class="text-[11px] text-gray-500">先にプロフィール入力が必要です</div>
                            </div>
                        </div>
                    </button>
                </div>

                <button id="btn-toggle-restore" 
                        class="w-full p-4 bg-white dark:bg-base-800 border-2 border-gray-100 dark:border-gray-700 rounded-2xl text-left hover:border-indigo-300 transition-all">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 bg-gray-100 dark:bg-gray-700 text-gray-500 rounded-full flex items-center justify-center text-xl">
                            <i class="ph-fill ph-cloud-arrow-down" aria-hidden="true"></i>
                        </div>
                        <div>
                            <div class="font-black text-base-900 dark:text-white">データを復元する</div>
                            <div class="text-[11px] text-gray-500">以前のバックアップから引き継ぎます</div>
                        </div>
                    </div>
                </button>

                <div id="restore-options" class="hidden space-y-2 p-2 bg-gray-50 dark:bg-black/20 rounded-xl animate-fadeIn">
                    <button data-action="onboarding:handleCloudRestore" class="w-full py-3 bg-white dark:bg-gray-800 rounded-xl text-xs font-bold shadow-sm flex items-center justify-center gap-2">
                        <i class="ph-fill ph-google-logo text-indigo-500" aria-hidden="true"></i> Google Driveから復元
                    </button>
                    <button data-action="onboarding:triggerJson" class="w-full py-3 bg-white dark:bg-gray-800 rounded-xl text-xs font-bold shadow-sm flex items-center justify-center gap-2">
                        <i class="ph-fill ph-file-js text-amber-500" aria-hidden="true"></i> JSONファイルを選択
                    </button>
                    <input type="file" id="wizard-import-file" class="hidden">
                </div>
                ${localStorage.getItem(FIRST_RECORD_INTENT_KEY) === 'beer' ? `
                <button data-action="onboarding:skipProfile" class="w-full py-2 text-xs font-bold text-gray-500 hover:text-indigo-500 transition">
                    後で設定する（ビール記録を先に開始）
                </button>
                ` : ''}
            </div>
        `,
        // このステップ自体にバリデーションは不要（ボタンクリックで遷移するため）
        validate: () => true 
    },
    {
        id: 'step-profile',
        title: 'プロフィール設定',
        desc: '正確な消費カロリー計算のために、体重と身長を設定します。<br>※基礎代謝の概算に使用されます。',
        render: () => `
            <div class="space-y-4">
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="text-xs font-bold text-gray-500 mb-1 block">体重 (kg)</label>
                        <input type="number" id="wiz-weight" class="w-full h-[56px] bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-indigo-500 rounded-xl p-3 font-bold text-lg text-center" placeholder="60">
                    </div>
                    <div>
                        <label class="text-xs font-bold text-gray-500 mb-1 block">身長 (cm)</label>
                        <input type="number" id="wiz-height" class="w-full h-[56px] bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-indigo-500 rounded-xl p-3 font-bold text-lg text-center" placeholder="170">
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="text-xs font-bold text-gray-500 mb-1 block">年齢</label>
                        <input type="number" id="wiz-age" class="w-full h-[56px] bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-indigo-500 rounded-xl p-3 font-bold text-lg text-center" placeholder="30">
                    </div>
                    <div>
                        <label class="text-xs font-bold text-gray-500 mb-1 block">計算基準</label>
                        <div class="relative">
                            <select id="wiz-gender" class="appearance-none w-full h-[56px] bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-indigo-500 rounded-xl p-3 font-bold text-base text-center">
                                <option value="male">男性基準</option>
                                <option value="female">女性基準</option>
                                <option value="other">その他</option>
                            </select>
                            <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-500">
                                <svg class="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                            </div>
                        </div>
                    </div>
                </div>
                ${localStorage.getItem(FIRST_RECORD_INTENT_KEY) === 'beer' ? `
                <button data-action="onboarding:skipProfile" class="w-full py-2 text-xs font-bold text-gray-500 hover:text-indigo-500 transition">
                    後で設定する（ビール記録を先に開始）
                </button>
                ` : ''}
            </div>
        `,
        validate: () => {
            const w = document.getElementById('wiz-weight').value;
            const h = document.getElementById('wiz-height').value;
            const a = document.getElementById('wiz-age').value;
            if(!w || !h || !a) {
                showMessage('正確な計算のため、全ての項目を入力してください', 'error');
                return false;
            }
            localStorage.setItem(APP.STORAGE_KEYS.WEIGHT, w);
            localStorage.setItem(APP.STORAGE_KEYS.HEIGHT, h);
            localStorage.setItem(APP.STORAGE_KEYS.AGE, a);
            localStorage.setItem(APP.STORAGE_KEYS.GENDER, document.getElementById('wiz-gender').value);
            localStorage.removeItem('nomutore_profile_deferred');
            return true;
        }
    },
    {
        id: 'step-beer',
        title: 'お気に入りビール',
        desc: 'よく飲むスタイルを設定してください。<br>ホーム画面の「本数換算」が、ここで選んだビールのカロリーを基準に表示されるようになります。',
        render: () => {
            const options = Object.keys(CALORIES.STYLES).map(k => `<option value="${k}">${k}</option>`).join('');
            return `
            <div class="space-y-4">
                <div>
                    <label class="text-xs font-bold text-gray-500 mb-1 block">メインビール</label>
                    <div class="relative">
                        <select id="wiz-mode1" class="appearance-none w-full h-[50px] bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-indigo-500 rounded-xl p-3 font-bold text-sm">
                            ${options}
                        </select>
                        <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-500">
                            <svg class="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                        </div>
                    </div>
                </div>
                <div>
                    <label class="text-xs font-bold text-gray-500 mb-1 block">サブビール</label>
                    <div class="relative">
                        <select id="wiz-mode2" class="appearance-none w-full h-[50px] bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-indigo-500 rounded-xl p-3 font-bold text-sm">
                            ${options}
                        </select>
                        <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-500">
                            <svg class="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                        </div>
                    </div>
                </div>
                <p class="text-[11px] text-gray-500 dark:text-gray-400 text-center">※Settingsタブからいつでも変更できます。</p>
            </div>
            `;
        },
        validate: () => {
            const m1 = document.getElementById('wiz-mode1').value;
            const m2 = document.getElementById('wiz-mode2').value;
            localStorage.setItem(APP.STORAGE_KEYS.MODE1, m1);
            localStorage.setItem(APP.STORAGE_KEYS.MODE2, m2);
            StateManager.setBeerMode('mode1');
            return true;
        }
    },

    {
        id: 'step-period',
        title: 'リセット周期',
        desc: '借金（カロリー）をリセットする間隔を選んでください。<br>オススメは「1週間」です。',
        render: () => `
            <div class="space-y-3">
                <button data-action="onboarding:setPeriod" data-mode="weekly" 
                        class="w-full p-4 bg-white dark:bg-gray-800 border-2 border-indigo-500 rounded-2xl text-left relative shadow-lg transform transition active:scale-95 group">
                    <div class="absolute -top-3 -right-2 bg-indigo-500 text-white text-[11px] font-bold px-2 py-1 rounded-full animate-bounce">
                        おすすめ
                    </div>
                    <div class="flex items-center gap-4">
                        <div class="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/50 text-brand dark:text-brand-light rounded-full flex items-center justify-center text-xl">
                            <i class="ph-bold ph-arrows-clockwise" aria-hidden="true"></i>
                        </div>
                        <div>
                            <h4 class="font-black text-sm text-gray-900 dark:text-white">週次リセット</h4>
                            <p class="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-tight">
                                毎週月曜日に<span class="font-bold text-red-500">借金をゼロ</span>にリセット。<br>
                                <span class="text-brand dark:text-brand-light font-bold">「先週は飲みすぎたけど今週は頑張ろう！」</span><br>
                                と気持ちを切り替えられます。
                            </p>
                        </div>
                    </div>
                </button>

                <button data-action="onboarding:setPeriod" data-mode="monthly" 
                        class="w-full p-3 bg-gray-50 dark:bg-gray-800/50 border-2 border-transparent hover:border-gray-300 dark:hover:border-gray-600 rounded-2xl text-left transition active:scale-95">
                    <div class="flex items-center gap-4">
                        <div class="w-10 h-10 bg-gray-200 dark:bg-gray-700 text-gray-500 rounded-full flex items-center justify-center text-xl">
                            <i class="ph-bold ph-calendar" aria-hidden="true"></i>
                        </div>
                        <div>
                            <h4 class="font-bold text-sm text-gray-900 dark:text-white">月次リセット</h4>
                            <p class="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                                毎月1日にリセット。<br>1ヶ月単位でじっくり管理したい方に。
                            </p>
                        </div>
                    </div>
                </button>

                <button data-action="onboarding:setPeriod" data-mode="permanent" 
                        class="w-full p-3 bg-gray-50 dark:bg-gray-800/50 border-2 border-transparent hover:border-gray-300 dark:hover:border-gray-600 rounded-2xl text-left transition active:scale-95">
                    <div class="flex items-center gap-4">
                        <div class="w-10 h-10 bg-gray-200 dark:bg-gray-700 text-gray-500 rounded-full flex items-center justify-center text-xl">
                            <i class="ph-bold ph-infinity" aria-hidden="true"></i>
                        </div>
                        <div>
                            <h4 class="font-bold text-sm text-gray-900 dark:text-white">リセットなし（永久）</h4>
                            <p class="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                                リセットなし。<br>過去の全記録を積み上げたいマニア向け。
                            </p>
                        </div>
                    </div>
                </button>
            </div>
        `
    },
    {
        id: 'step-data-safety',
        title: '重要',
        desc: 'データの保護について（必ずお読みください）',
        render: () => `
            <div class="space-y-4">
                <div class="bg-red-50 dark:bg-red-900/10 border-2 border-red-100 dark:border-red-900/30 rounded-2xl p-4">
                    <div class="flex items-center gap-3 mb-3">
                        <i class="ph-fill ph-warning-circle text-3xl text-red-500" aria-hidden="true"></i>
                        <h3 class="font-bold text-red-600 dark:text-red-400">データは端末に保存されます</h3>
                    </div>
                    
                    <div class="space-y-3 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                        <p>
                            NOMUTOREはプライバシー重視のため、<span class="font-bold text-gray-800 dark:text-white">サーバーにデータを送信しません。</span>
                        </p>
                        <p>
                            そのため、<span class="font-bold text-red-500 underline decoration-2 decoration-red-200">ブラウザの履歴削除やキャッシュクリア</span>を行うと、全ての記録が消えてしまう可能性があります。
                        </p>
                    </div>
                </div>

                <div class="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-xl flex gap-3 items-start">
                    <i class="ph-fill ph-cloud-arrow-up text-xl text-indigo-500 mt-0.5" aria-hidden="true"></i>
                    <div class="text-xs text-indigo-800 dark:text-indigo-200">
                        <p class="font-bold mb-1">バックアップを推奨します</p>
                        <p class="opacity-80">設定画面から「Googleドライブ」または「JSONファイル」でのバックアップが可能です。定期的な保存をお勧めします。</p>
                    </div>
                </div>

                <label class="flex items-center justify-center gap-2 mt-2 p-2 rounded-xl bg-white/60 dark:bg-white/5 cursor-pointer border border-red-100 dark:border-red-900/30">
                    <input type="checkbox" id="wiz-data-safety-ack" class="w-4 h-4 accent-emerald-500">
                    <span class="text-[11px] font-bold">上記を理解しました（必須）</span>
                </label>

                <div class="flex items-center justify-center gap-2 opacity-60">
                    <i class="ph-bold ph-check-circle text-emerald-500" aria-hidden="true"></i>
                    <span class="text-[11px] font-bold">確認後に次へ進めます</span>
                </div>
            </div>
        `,
        validate: () => {
            const ack = /** @type {HTMLInputElement|null} */ (document.getElementById('wiz-data-safety-ack'));
            if (!ack || !ack.checked) {
                showMessage('データ保護の注意事項への同意が必要です', 'error');
                return false;
            }
            localStorage.setItem('nomutore_data_safety_ack_completed', 'true');
            return true;
        }
    },
    {
        id: 'step-summary',
        title: '設定内容の確認',
        desc: 'この内容ではじめます。必要なら戻って修正できます。',
        render: () => {
            const weight = localStorage.getItem(APP.STORAGE_KEYS.WEIGHT) || '-';
            const height = localStorage.getItem(APP.STORAGE_KEYS.HEIGHT) || '-';
            const age = localStorage.getItem(APP.STORAGE_KEYS.AGE) || '-';
            const gender = localStorage.getItem(APP.STORAGE_KEYS.GENDER) || APP.DEFAULTS.GENDER;
            const mode1 = localStorage.getItem(APP.STORAGE_KEYS.MODE1) || APP.DEFAULTS.MODE1;
            const mode2 = localStorage.getItem(APP.STORAGE_KEYS.MODE2) || APP.DEFAULTS.MODE2;
            const periodMode = localStorage.getItem(APP.STORAGE_KEYS.PERIOD_MODE) || APP.DEFAULTS.PERIOD_MODE;
            const genderLabelMap = {
                male: '男性基準',
                female: '女性基準',
                other: 'その他'
            };
            const periodLabelMap = {
                weekly: '週次リセット',
                monthly: '月次リセット',
                permanent: 'リセットなし（永久）',
                custom: 'カスタム'
            };
            const genderLabel = genderLabelMap[gender] || 'その他';
            const periodLabel = periodLabelMap[periodMode] || periodMode;

            return `
                <div class="space-y-3 text-sm text-gray-900 dark:text-gray-100">
                    <div class="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/70">
                        <p class="text-[11px] text-gray-500 mb-1">プロフィール</p>
                        <p class="font-bold text-gray-900 dark:text-gray-100">体重 ${weight}kg / 身長 ${height}cm / 年齢 ${age}</p>
                        <p class="font-bold text-gray-900 dark:text-gray-100">計算基準: ${genderLabel}</p>
                    </div>
                    <div class="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/70">
                        <p class="text-[11px] text-gray-500 mb-1">お気に入りビール</p>
                        <p class="font-bold text-gray-900 dark:text-gray-100">メイン: ${mode1}</p>
                        <p class="font-bold text-gray-900 dark:text-gray-100">サブ: ${mode2}</p>
                    </div>
                    <div class="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/70">
                        <p class="text-[11px] text-gray-500 mb-1">リセット周期</p>
                        <p class="font-bold text-gray-900 dark:text-gray-100">${periodLabel}</p>
                    </div>
                    <p class="text-[11px] text-gray-500 text-center">※修正する場合は「Back」で戻ってください。</p>
                </div>
            `;
        },
        validate: () => true
    },

    {
        id: 'step-start',
        title: 'Beer & Burn',
        desc: '',
        render: () => `
            <div class="text-center space-y-6 py-4">
                <div class="text-6xl animate-pulse">🍻</div>
                <div>
                    <h3 class="text-xl font-black text-base-900 dark:text-white mb-2">Ready to Drink?</h3>
                    <p class="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                        飲んだ分だけ、動いて返す。<br>
                        「実質ゼロ」を目指しましょう。
                    </p>
                </div>
            </div>
        `,
        validate: () => true
    }
];

/* ==========================================================================
   Phase B: Onboarding Logic
   ========================================================================== */

export const Onboarding = {
    
    /**
     * アプリ本体の隠されているUIを一括表示する
     */
    showAppUI: () => {
        // 先行ガードで追加したスタイルを無効化（もしあれば）
    const styleGuards = document.querySelectorAll('style');
    styleGuards.forEach(s => {
        if (s.textContent.includes('#landing-page')) s.remove();
    });
       // ★追加: 強力な非表示ガード（app-ready）を解除する
        if (typeof showAppShell === 'function') {
            showAppShell();
        } else {
            // 万が一関数がなくても確実に解除するフォールバック
            document.body.classList.add('app-ready'); 
        }
        const elements = [
            document.querySelector('header'),
            document.querySelector('main'),
            document.querySelector('nav'),
            document.getElementById('btn-fab-fixed')
        ];
        elements.forEach(el => {
            if (el) el.classList.remove('hidden');
        });
    },

    /**
     * オンボーディング（ウィザード）開始
     * 完了済みならアプリ本体を表示して終了する
     */
    start: async () => {
        if (localStorage.getItem(APP.STORAGE_KEYS.ONBOARDED)) {
            Onboarding.showAppUI(); // ★ここが重要：完了済みなら本体を表示
            return;
        }
        Onboarding.showWizard(0);
    },

    /**
     * 新規ユーザーとしてウィザードを進行させる
     */
    startNew: (intent = 'beer') => {
        const normalizedIntent = intent === 'exercise' ? 'exercise' : 'beer';
        localStorage.setItem(FIRST_RECORD_INTENT_KEY, normalizedIntent);

        // 復元オプションが表示されている場合は隠す
        const restoreOptions = document.getElementById('restore-options');
        if (restoreOptions) {
            restoreOptions.classList.add('hidden');
        }

        Feedback.haptic.light();

        // ビール先行ならプロフィールを自動で後回しし、直接お気に入りビールへ進める
        if (normalizedIntent === 'beer') {
            applyDeferredProfileDefaults();
            Onboarding.showWizard(2);
            return;
        }

        // 運動先行はプロフィール入力が必須
        Onboarding.showWizard(1);
    },

    skipProfile: () => {
        applyDeferredProfileDefaults();

        // プロフィール未入力エラーのバリデーションは通さず、次ステップへ遷移
        Feedback.haptic.light();
        if (currentStepIndex < WIZARD_STEPS.length - 1) {
            Onboarding.showWizard(currentStepIndex + 1);
        } else {
            Onboarding.finishWizard();
        }
    },

    showWizard: (index) => {
        currentStepIndex = index;
        const step = WIZARD_STEPS[index];
        const modal = document.getElementById('onboarding-modal');
        const container = document.getElementById('wizard-content');
        const title = document.getElementById('wizard-title');
        const desc = document.getElementById('wizard-desc');
        const btnNext = document.getElementById('btn-wizard-next');
        const btnPrev = document.getElementById('btn-wizard-prev');
        const dots = document.getElementById('wizard-dots');

        title.textContent = step.title;
        desc.innerHTML = step.desc;
        container.innerHTML = step.render();

        const fileInput = container.querySelector('#wizard-import-file');
    if (fileInput) {
        fileInput.onchange = (e) => Onboarding.handleJsonRestore(e.target);
    }
    const toggleBtn = container.querySelector('#btn-toggle-restore');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => document.getElementById('restore-options').classList.toggle('hidden'));
    }
        
        // 初期値セット
        if (index === 1) {
            const w = document.getElementById('wiz-weight');
            if(w && localStorage.getItem(APP.STORAGE_KEYS.WEIGHT)) w.value = localStorage.getItem(APP.STORAGE_KEYS.WEIGHT);
        }
        if (index === 2) {
            const m1 = document.getElementById('wiz-mode1');
            if(m1) m1.value = localStorage.getItem(APP.STORAGE_KEYS.MODE1) || '国産ピルスナー';
            const m2 = document.getElementById('wiz-mode2');
            if(m2) m2.value = localStorage.getItem(APP.STORAGE_KEYS.MODE2) || 'Hazy IPA';
        }

        dots.innerHTML = WIZARD_STEPS.map((_, i) => 
            `<div class="w-2 h-2 rounded-full transition-all ${i === index ? 'bg-brand w-4' : 'bg-gray-300'}"></div>`
        ).join('');

        // --- 2. ボタンの表示制御（ここに追加） ---
    
    // Backボタン：最初のステップなら隠す
    if (index === 0) btnPrev.classList.add('invisible');
    else btnPrev.classList.remove('invisible');

    // Nextボタン：ステップに応じた切り替え
    if (index === 0) {
        // Welcomeページでは、中のカードボタンで次に進ませるため、下のNextボタンは消す
        btnNext.classList.add('hidden');
    } else {
        btnNext.classList.remove('hidden');
        
        if (index === WIZARD_STEPS.length - 1) {
            // 最後のステップ
            btnNext.textContent = "はじめる";
            btnNext.className = "px-6 py-3 bg-brand text-white rounded-xl font-black shadow-lg shadow-brand/30 hover:bg-brand-dark transition transform hover:scale-105 active:scale-95";
        } else {
            // 中間のステップ
            btnNext.textContent = "次へ";
            btnNext.className = "px-6 py-3 bg-base-900 dark:bg-white text-white dark:text-base-900 rounded-xl font-black hover:opacity-90 transition active:scale-95";
        }
    }

        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0', 'scale-95');
            modal.classList.add('opacity-100', 'scale-100');
        }, 10);
    },

    nextStep: () => {
        const step = WIZARD_STEPS[currentStepIndex];
        if (step.validate && !step.validate()) return;
        
        Feedback.haptic.light();

        if (currentStepIndex < WIZARD_STEPS.length - 1) {
            Onboarding.showWizard(currentStepIndex + 1);
        } else {
            Onboarding.finishWizard();
        }
    },

    prevStep: () => {
        if (currentStepIndex > 0) {
            Onboarding.showWizard(currentStepIndex - 1);
        }
    },

    finishWizard: () => {
        const modal = document.getElementById('onboarding-modal');
        modal.classList.add('opacity-0', 'scale-95');
        setTimeout(() => {
            modal.classList.add('hidden');
            Onboarding.complete(); // ★ completeの中でshowAppUIを呼ぶ
        }, 300);
        
        showConfetti();
        document.dispatchEvent(new CustomEvent('refresh-ui'));
    },

    complete: () => {
        localStorage.setItem(APP.STORAGE_KEYS.ONBOARDED, 'true');
        Onboarding.showAppUI();

        // mandatory tour 終了後に Record タブへ誘導する
        localStorage.setItem(POST_TOUR_GO_RECORD_KEY, 'true');

        // ツアー中のターゲット要素ずれを避けるため、開始時はHomeを表示
        const homeTabBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById('nav-tab-home'));
        if (homeTabBtn) {
            homeTabBtn.click();
        }

        Onboarding.startTour();
    },

    /* ==========================================================================
       Phase C: UI Tour (Driver.js)
       ========================================================================== */
    
    stopTour: () => {
        if (Onboarding._tourStartTimer) {
            clearTimeout(Onboarding._tourStartTimer);
            Onboarding._tourStartTimer = null;
        }

        const activeTour = Onboarding._activeTour;
        if (activeTour) {
            try {
                activeTour.destroy();
            } catch (_) {
                // ignore
            }

            Onboarding._activeTour = null;
        }

        // Driver.js の残留DOM/状態を強制的に掃除
        document.querySelectorAll('.driver-overlay, .driver-popover, .driver-highlighted-element, .driver-active-element').forEach(el => {
            el.remove();
        });

        document.body.classList.remove('driver-active', 'driver-no-interaction');
        document.documentElement.classList.remove('driver-active', 'driver-no-interaction');

        // オーバーレイ解除漏れに備え、操作不能を回避
        document.body.style.pointerEvents = '';
        document.documentElement.style.pointerEvents = '';

        localStorage.removeItem(MANDATORY_TOUR_RUNNING_KEY);
    },

    startTour: () => {
        Onboarding.stopTour();
        localStorage.setItem(MANDATORY_TOUR_RUNNING_KEY, 'true');

        const driverObj = driver({
            showProgress: true,
            animate: true,
            allowClose: true,
            doneBtnText: '完了',
            nextBtnText: '次へ',
            prevBtnText: '戻る',
            onDestroyed: () => {
                if (Onboarding._activeTour === driverObj) {
                    Onboarding._activeTour = null;
                }
                localStorage.removeItem(MANDATORY_TOUR_RUNNING_KEY);

                if (localStorage.getItem(POST_TOUR_GO_RECORD_KEY) === 'true') {
                    localStorage.removeItem(POST_TOUR_GO_RECORD_KEY);
                    const recordTabBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById('nav-tab-record'));
                    if (recordTabBtn) {
                        setTimeout(() => recordTabBtn.click(), 80);
                    }
                }

                document.dispatchEvent(new CustomEvent('onboarding:mandatoryTourFinished'));
            },
            steps: MANDATORY_TOUR_STEPS
        });

        Onboarding._activeTour = driverObj;
        Onboarding._tourStartTimer = setTimeout(() => {
            if (Onboarding._activeTour !== driverObj) return;
            driverObj.drive();
            Onboarding._tourStartTimer = null;
        }, 500);
    },


    startDetailedTour: (scope = 'home') => {
        const steps = DETAILED_TOUR_STEPS[scope] || DETAILED_TOUR_STEPS.home;
        const availableSteps = steps.filter(step => document.querySelector(step.element));

        if (!availableSteps.length) {
            showMessage('この画面で開始できる詳細ツアーが見つかりませんでした。', 'warning');
            return;
        }

        Onboarding.stopTour();

        const driverObj = driver({
            showProgress: true,
            animate: true,
            allowClose: true,
            doneBtnText: '完了',
            nextBtnText: '次へ',
            prevBtnText: '戻る',
            onDestroyed: () => {
                if (Onboarding._activeTour === driverObj) {
                    Onboarding._activeTour = null;
                }
            },
            steps: availableSteps
        });

        Onboarding._activeTour = driverObj;
        Onboarding._tourStartTimer = setTimeout(() => {
            if (Onboarding._activeTour !== driverObj) return;
            driverObj.drive();
            Onboarding._tourStartTimer = null;
        }, 120);
    },

    _activeTour: null,
    _tourStartTimer: null
};

/* ==========================================================================
   Phase D: Landing Page & Concept (v5 Rich Edition)
   ========================================================================== */

Onboarding.checkLandingPage = () => {
    const lp = document.getElementById('landing-page');
    if (!lp) return;

    if (localStorage.getItem('nomutore_lp_seen_v5')) {
        lp.remove();
        Onboarding.showAppUI();
        Onboarding.start();
        return;
    }

    // --- Power On 演出 ---
    const logo = lp.querySelector('img');
    if (logo) {
        setTimeout(() => {
            logo.classList.remove('opacity-0');
            logo.classList.add('neon-power-on');
        }, 300);
    }

    // --- 有機的な泡の生成 ---
    const bubbleContainer = lp.querySelector('.bubble-container');
    if (bubbleContainer) {
        bubbleContainer.innerHTML = ''; 
        for (let i = 0; i < 30; i++) {
            const bubble = document.createElement('div');
            bubble.className = 'lp-bubble';
            const size = Math.random() * 15 + 5;
            const left = Math.random() * 100;
            const delay = Math.random() * 8;
            const duration = Math.random() * 5 + 5;
            Object.assign(bubble.style, {
                width: `${size}px`, height: `${size}px`, left: `${left}%`,
                animationDelay: `${delay}s`, animationDuration: `${duration}s`
            });
            bubbleContainer.appendChild(bubble);
        }
    }
};

Onboarding.closeLandingPage = () => {
    const lp = document.getElementById('landing-page');
    const concept = document.getElementById('concept-page');
    
    // v5既読フラグを立てる
    localStorage.setItem('nomutore_lp_seen_v5', 'true');

    if (lp) {
        lp.classList.add('landing-fade-out');
        setTimeout(() => {
            lp.remove();
            if (concept) {
                concept.classList.remove('hidden');
                requestAnimationFrame(() => concept.classList.add('opacity-100'));
            } else {
                Onboarding.showAppUI();
            }
        }, 800);
    }
};

Onboarding.goToWizard = () => {
    const concept = document.getElementById('concept-page');
    if (concept) {
        concept.classList.replace('opacity-100', 'opacity-0');
        setTimeout(() => {
            concept.remove();
            Onboarding.start(); 
        }, 600);
    }
};

// Google Drive 復元処理
Onboarding.handleCloudRestore = async () => {
    try {
            // インポートしていれば window. は不要で、存在チェックも不要になります
            showMessage('Google Driveを確認中...', 'info');
            const success = await DataManager.restoreFromCloud({
                confirmRestore: ({ logsCount, checksCount }) =>
                    confirm(`ログ ${logsCount}件、チェック ${checksCount}件を復元しますか？
(既存データと重複するものはスキップされます)`),
                confirmArchiveBackfill: ({ mode, archivesCount, logsCount }) => {
                    if (archivesCount > 0 || logsCount === 0) return false;
                    const label = mode === 'weekly' ? '週次' : '月次';
                    return confirm(`バックアップにアーカイブが含まれていません。
復元したログから過去の${label}アーカイブを自動生成しますか？`);
                }
            });
            if (success) {
                showMessage('☁️ ドライブから復元しました', 'success');
                Onboarding.completeAfterRestore();
            }
        } catch (e) { 
            console.error(e);
            showMessage('復元に失敗しました', 'error'); 
        }
};

// JSON ファイル復元処理
Onboarding.handleJsonRestore = async (input) => {
    try {
            const success = await DataManager.importJSON(input, {
                confirmRestore: ({ logsCount, checksCount }) =>
                    confirm(`ログ ${logsCount}件、チェック ${checksCount}件を復元しますか？
(既存データと重複するものはスキップされます)`),
                confirmArchiveBackfill: ({ mode, archivesCount, logsCount }) => {
                    if (archivesCount > 0 || logsCount === 0) return false;
                    const label = mode === 'weekly' ? '週次' : '月次';
                    return confirm(`バックアップにアーカイブが含まれていません。
復元したログから過去の${label}アーカイブを自動生成しますか？`);
                }
            });
            if (success) Onboarding.completeAfterRestore();
        } catch (e) { 
            console.error(e);
            showMessage('ファイルの読み込みに失敗しました', 'error'); 
        }
};

// 復元成功後の処理
Onboarding.completeAfterRestore = () => {
    // 1. 復元が完了したことをフラグで保存
    localStorage.setItem(APP.STORAGE_KEYS.ONBOARDED, 'true');
    localStorage.setItem('nomutore_lp_seen_v5', 'true');

    // 2. 少しだけ待ってからリロード（メッセージを読ませるため）
    // リロードすることで、アプリが「設定済み状態」で一から立ち上がります
    setTimeout(() => {
        window.location.reload(); 
    }, 2500);
};

Onboarding.playSplash = () => {
    const lp = document.getElementById('landing-page');
    const content = document.getElementById('lp-content'); // ボタンを含むコンテナ
    
    if (!lp) return;

    // 1. LPを表示
    lp.classList.remove('hidden');
    
    // 2. ボタンだけを特定して隠す（コンテナごと消すとレイアウトが崩れるため）
    const startBtn = document.getElementById('btn-start-app');
    if (startBtn) startBtn.classList.add('hidden');

    // 3. ボタンの代わりに「Welcomeメッセージ」を挿入してレイアウトを維持する
    // ※ 既存のメッセージがあれば消しておく
    const existingMsg = document.getElementById('splash-welcome-msg');
    if (existingMsg) existingMsg.remove();

    const msg = document.createElement('div');
    msg.id = 'splash-welcome-msg';
    msg.className = 'mt-8 text-sm font-bold text-indigo-200 animate-pulse tracking-widest uppercase';
    msg.textContent = 'おかえりなさい';
    
    // ボタンがあった場所（content内）に追加
    if (content) {
        content.classList.remove('hidden'); // コンテナ自体は表示しておく
        content.appendChild(msg);
    }

    // 4. クリックで即スキップ
    const skipHandler = () => {
        lp.classList.add('opacity-0', 'pointer-events-none');
        setTimeout(() => {
            lp.classList.add('hidden');
            lp.classList.remove('opacity-0', 'pointer-events-none');
            
            // 状態復帰（次回のために元に戻す）
            if (startBtn) startBtn.classList.remove('hidden');
            if (msg) msg.remove();
            
        }, 600);
        lp.removeEventListener('click', skipHandler);
    };
    lp.addEventListener('click', skipHandler);

    // 5. 自動フェードアウト (少し短縮してテンポアップ)
    setTimeout(() => {
        if (!lp.classList.contains('hidden')) {
            skipHandler();
        }
    }, 2000); // 2秒で十分
};
