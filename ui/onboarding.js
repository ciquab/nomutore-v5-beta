import { driver } from "https://cdn.jsdelivr.net/npm/driver.js@1.0.1/dist/driver.js.mjs";
import { APP, CALORIES } from '../constants.js';
import { StateManager } from './state.js';
import { Feedback, showConfetti, showMessage } from './dom.js';

/* ==========================================================================
   Phase A: Initial Setup
   ========================================================================== */

const WIZARD_STEPS = [
    {
        id: 'step-profile',
        title: 'Profile Settings',
        desc: '正確な消費カロリー計算のために、体重と身長を設定します。<br>※基礎代謝の概算に使用されます。',
        render: () => `
            <div class="space-y-4">
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="text-xs font-bold text-gray-500 mb-1 block">Weight (kg)</label>
                        <input type="number" id="wiz-weight" class="w-full h-[56px] bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-indigo-500 rounded-xl p-3 font-bold text-lg text-center" placeholder="60">
                    </div>
                    <div>
                        <label class="text-xs font-bold text-gray-500 mb-1 block">Height (cm)</label>
                        <input type="number" id="wiz-height" class="w-full h-[56px] bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-indigo-500 rounded-xl p-3 font-bold text-lg text-center" placeholder="170">
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="text-xs font-bold text-gray-500 mb-1 block">Age</label>
                        <input type="number" id="wiz-age" class="w-full h-[56px] bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-indigo-500 rounded-xl p-3 font-bold text-lg text-center" placeholder="30">
                    </div>
                    <div>
                        <label class="text-xs font-bold text-gray-500 mb-1 block">Gender</label>
                        <div class="relative">
                            <select id="wiz-gender" class="appearance-none w-full h-[56px] bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-indigo-500 rounded-xl p-3 font-bold text-lg text-center">
                                <option value="male">Male</option>
                                <option value="female">Female</option>
                            </select>
                            <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-500">
                                <svg class="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                            </div>
                        </div>
                    </div>
                </div>
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
            return true;
        }
    },
    {
        id: 'step-beer',
        title: 'Favorite Beer',
        desc: 'よく飲むスタイルを設定してください。<br>ホーム画面の「本数換算」が、ここで選んだビールのカロリーを基準に表示されるようになります。',
        render: () => {
            const options = Object.keys(CALORIES.STYLES).map(k => `<option value="${k}">${k}</option>`).join('');
            return `
            <div class="space-y-4">
                <div>
                    <label class="text-xs font-bold text-gray-500 mb-1 block">Favorite Beer 1 (Main)</label>
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
                    <label class="text-xs font-bold text-gray-500 mb-1 block">Favorite Beer 2 (Sub)</label>
                    <div class="relative">
                        <select id="wiz-mode2" class="appearance-none w-full h-[50px] bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-indigo-500 rounded-xl p-3 font-bold text-sm">
                            ${options}
                        </select>
                        <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-500">
                            <svg class="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                        </div>
                    </div>
                </div>
                <p class="text-[10px] text-gray-400 text-center">※Settingsタブからいつでも変更できます。</p>
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

let currentStepIndex = 0;

export const Onboarding = {
    
    start: async () => {
        if (localStorage.getItem('nomutore_onboarding_complete')) return;
        Onboarding.showWizard(0);
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
        
        // 初期値セット
        if (index === 0) {
            const w = document.getElementById('wiz-weight');
            if(w && localStorage.getItem(APP.STORAGE_KEYS.WEIGHT)) w.value = localStorage.getItem(APP.STORAGE_KEYS.WEIGHT);
        }
        if (index === 1) {
            const m1 = document.getElementById('wiz-mode1');
            if(m1) m1.value = localStorage.getItem(APP.STORAGE_KEYS.MODE1) || '国産ピルスナー';
            const m2 = document.getElementById('wiz-mode2');
            if(m2) m2.value = localStorage.getItem(APP.STORAGE_KEYS.MODE2) || 'Hazy IPA';
        }

        dots.innerHTML = WIZARD_STEPS.map((_, i) => 
            `<div class="w-2 h-2 rounded-full transition-all ${i === index ? 'bg-indigo-600 w-4' : 'bg-gray-300'}"></div>`
        ).join('');

        if (index === 0) btnPrev.classList.add('invisible');
        else btnPrev.classList.remove('invisible');

        if (index === WIZARD_STEPS.length - 1) {
            btnNext.textContent = "Start";
            btnNext.className = "px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/30 hover:bg-indigo-700 transition transform hover:scale-105";
        } else {
            btnNext.textContent = "Next";
            btnNext.className = "px-6 py-3 bg-base-900 dark:bg-white text-white dark:text-base-900 rounded-xl font-bold hover:opacity-90 transition";
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
            Onboarding.startTour();
        }, 300);
        
        localStorage.setItem('nomutore_onboarding_complete', 'true');
        showConfetti();
        document.dispatchEvent(new CustomEvent('refresh-ui'));
    },

    /* ==========================================================================
       Phase B: UI Tour
       ========================================================================== */
    
    startTour: () => {
        const driverObj = driver({
            showProgress: true,
            animate: true,
            allowClose: false,
            doneBtnText: 'Finish',
            nextBtnText: 'Next',
            prevBtnText: 'Back',
            steps: [
                {
                    element: '#beer-select-display', 
                    popover: {
                        title: 'Select Beer Style',
                        description: 'タップでFavorite Beerを切り替えます。<br>選択中のビールのカロリーを基準に、タンクの残量表示（本数）が再計算されます。',
                        side: 'bottom', 
                        align: 'center'
                    }
                },
                { 
                    element: '.orb-container', 
                    popover: { 
                        title: 'Balance', 
                        description: 'カロリー収支（Balance）を表示します。<br>飲んでプラスになった分を、運動で消費しましょう。',
                        side: 'bottom',
                        align: 'center'
                    } 
                },
                { 
                    element: '#nav-tab-record', 
                    popover: { 
                        title: 'Record', 
                        description: 'ビールや運動の記録はここから。<br>また、画面を<strong>左右にスワイプ</strong>することでもタブを切り替えられます。',
                        side: 'top',
                        align: 'center' // 画面中央下のタブバーにはcenterが最も安定します
                    } 
                },
                { 
                    element: '#liver-rank-card', 
                    popover: { 
                        title: 'Liver Rank', 
                        description: 'あなたのランクです。<br>休肝日や完済（ビールのカロリーを運動で相殺すること）を継続すると、ランクが上がります。'
                    } 
                },
                { 
                    element: '#btn-fab-fixed', 
                    popover: { 
                        title: 'Quick Actions',
                        description: 'よく使う機能をここからすぐに呼び出せます。',
                        side: 'top',
                        align: 'center' // endだと右端に寄りすぎて矢印がズレるため、centerに変更して調整
                    } 
                },
                {
                    element: '#btn-help', 
                    popover: {
                        title: 'Need Help?',
                        description: '詳しい使い方やヒントは、いつでもこのボタンから確認できます。<br>Good Luck!',
                        side: 'bottom',
                        align: 'end' // 右上のボタンなのでend（右寄せ）で正解
                    }
                }
            ]
        });

        setTimeout(() => driverObj.drive(), 500);
    }
};

/* ==========================================================================
   Phase C: Landing Page (v5 Rich Edition)
   ========================================================================== */

/**
 * LPの既読チェックと初期化
 * main.js の initApp から呼ばれることを想定
 */
Onboarding.checkLandingPage = () => {
    const lp = document.getElementById('landing-page');
    if (!lp) return;

    // v5用のLP既読フラグをチェック
    if (localStorage.getItem('nomutore_lp_seen_v5')) {
        lp.remove();
        // LPが既読なら、そのままオンボーディング（ウィザード）が必要かチェック
        Onboarding.start();
        return;
    }
    
    // 未読ならLPを表示（hiddenを外す）
    lp.classList.remove('hidden');
};

/**
 * LPを閉じてアプリ本編（またはウィザード）へ遷移
 */
Onboarding.closeLandingPage = () => {
    const lp = document.getElementById('landing-page');
    if (!lp) return;

    // 期待感を高める触覚フィードバック
    if (Feedback && Feedback.haptic) {
        Feedback.haptic.medium();
    }
    
    // フェードアウトアニメーション（CSSクラス適用）
    lp.classList.add('landing-fade-out');
    
    setTimeout(() => {
        lp.remove();
        // 既読フラグを保存
        localStorage.setItem('nomutore_lp_seen_v5', 'true');
        
        // プロフィール設定（体重）が未入力ならウィザードを開始
        const hasWeight = localStorage.getItem(APP.STORAGE_KEYS.WEIGHT);
        if (!hasWeight) {
            Onboarding.start();
        }
    }, 1000);
};

window.Onboarding = Onboarding;