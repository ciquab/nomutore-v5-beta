import { driver } from "https://cdn.jsdelivr.net/npm/driver.js@1.0.1/dist/driver.js.mjs";
import { APP, CALORIES } from '../constants.js';
import { StateManager } from './state.js';
import { Feedback, showConfetti, showMessage } from './dom.js';
import { DataManager } from '../dataManager.js';
import { CloudManager } from '../cloudManager.js';

let currentStepIndex = 0;

/* ==========================================================================
   Phase A: Initial Setup (Wizard Steps)
   ========================================================================== */

const WIZARD_STEPS = [
    {
        id: 'step-welcome',
        title: 'Welcome back?',
        desc: 'はじめての方、またはデータを引き継ぐ方を選択してください。',
        render: () => `
            <div class="space-y-4">
                <button onclick="document.getElementById('restore-options').classList.add('hidden'); Onboarding.nextStep();" 
                        class="w-full p-4 bg-indigo-50 dark:bg-indigo-900/30 border-2 border-indigo-200 dark:border-indigo-800 rounded-2xl text-left group hover:border-indigo-500 transition-all">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 bg-indigo-600 text-white rounded-full flex items-center justify-center text-xl">
                            <i class="ph-fill ph-sparkle"></i>
                        </div>
                        <div>
                            <div class="font-black text-base-900 dark:text-white">新規ではじめる</div>
                            <div class="text-[10px] text-gray-500">新しく記録を開始します</div>
                        </div>
                    </div>
                </button>

                <button onclick="document.getElementById('restore-options').classList.toggle('hidden')" 
                        class="w-full p-4 bg-white dark:bg-base-800 border-2 border-gray-100 dark:border-gray-700 rounded-2xl text-left hover:border-indigo-300 transition-all">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 bg-gray-100 dark:bg-gray-700 text-gray-500 rounded-full flex items-center justify-center text-xl">
                            <i class="ph-fill ph-cloud-arrow-down"></i>
                        </div>
                        <div>
                            <div class="font-black text-base-900 dark:text-white">データを復元する</div>
                            <div class="text-[10px] text-gray-500">以前のバックアップから引き継ぎます</div>
                        </div>
                    </div>
                </button>

                <div id="restore-options" class="hidden space-y-2 p-2 bg-gray-50 dark:bg-black/20 rounded-xl animate-fadeIn">
                    <button onclick="Onboarding.handleCloudRestore()" class="w-full py-3 bg-white dark:bg-gray-800 rounded-xl text-xs font-bold shadow-sm flex items-center justify-center gap-2">
                        <i class="ph-fill ph-google-logo text-indigo-500"></i> Google Driveから復元
                    </button>
                    <button onclick="document.getElementById('wizard-import-file').click()" class="w-full py-3 bg-white dark:bg-gray-800 rounded-xl text-xs font-bold shadow-sm flex items-center justify-center gap-2">
                        <i class="ph-fill ph-file-js text-amber-500"></i> JSONファイルを選択
                    </button>
                    <input type="file" id="wizard-import-file" class="hidden" onchange="Onboarding.handleJsonRestore(this)">
                </div>
            </div>
        `,
        // このステップ自体にバリデーションは不要（ボタンクリックで遷移するため）
        validate: () => true 
    },
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

/* ==========================================================================
   Phase B: Onboarding Logic
   ========================================================================== */

export const Onboarding = {
    
    /**
     * アプリ本体の隠されているUIを一括表示する
     */
    showAppUI: () => {
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
        if (localStorage.getItem('nomutore_onboarding_complete')) {
            Onboarding.showAppUI(); // ★ここが重要：完了済みなら本体を表示
            return;
        }
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
            `<div class="w-2 h-2 rounded-full transition-all ${i === index ? 'bg-indigo-600 w-4' : 'bg-gray-300'}"></div>`
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
            btnNext.textContent = "Start";
            btnNext.className = "px-6 py-3 bg-indigo-600 text-white rounded-xl font-black shadow-lg shadow-indigo-600/30 hover:bg-indigo-700 transition transform hover:scale-105 active:scale-95";
        } else {
            // 中間のステップ
            btnNext.textContent = "Next";
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
        localStorage.setItem('nomutore_onboarding_complete', 'true');
        Onboarding.showAppUI();
        Onboarding.startTour();
    },

    /* ==========================================================================
       Phase C: UI Tour (Driver.js)
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
                        align: 'center'
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
                        align: 'center'
                    } 
                },
                {
                    element: '#btn-help', 
                    popover: {
                        title: 'Need Help?',
                        description: '詳しい使い方やヒントは、いつでもこのボタンから確認できます。<br>Good Luck!',
                        side: 'bottom',
                        align: 'end'
                    }
                }
            ]
        });

        setTimeout(() => driverObj.drive(), 500);
    }
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
            const success = await CloudManager.restore();
            if (success) Onboarding.completeAfterRestore();
        } catch (e) { 
            console.error(e);
            showMessage('復元に失敗しました', 'error'); 
        }
};

// JSON ファイル復元処理
Onboarding.handleJsonRestore = async (input) => {
    try {
            const success = await DataManager.importJSON(input);
            if (success) Onboarding.completeAfterRestore();
        } catch (e) { 
            console.error(e);
            showMessage('ファイルの読み込みに失敗しました', 'error'); 
        }
};

// 復元成功後の処理
Onboarding.completeAfterRestore = () => {
    // 1. 復元が完了したことをフラグで保存
    localStorage.setItem('nomutore_onboarding_complete', 'true');
    localStorage.setItem('nomutore_lp_seen_v5', 'true');

    // 2. 少しだけ待ってからリロード（メッセージを読ませるため）
    // リロードすることで、アプリが「設定済み状態」で一から立ち上がります
    setTimeout(() => {
        window.location.reload(); 
    }, 1000);
};

window.Onboarding = Onboarding;