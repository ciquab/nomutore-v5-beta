// @ts-check
import { APP, EXERCISE } from '../constants.js';
import { Calc } from '../logic.js';
import { Store } from '../store.js';
import { StateManager } from './state.js';
import { DOM, escapeHtml, AudioEngine } from './dom.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

// --- キャッシュ対策: 3D回転に必要な設定のみを強制注入 ---
const styleId = 'nomutore-tank-anim-style';
if (!document.getElementById(styleId)) {
    const styleFix = document.createElement('style');
    styleFix.id = styleId;
    styleFix.innerHTML = `
        #tank-wrapper {
            perspective: 1000px !important;
            -webkit-perspective: 1000px !important;
            transform-style: preserve-3d !important;
        }
        
        .orb-container {
            transform-style: preserve-3d !important;
            -webkit-transform-style: preserve-3d !important;
            will-change: transform; 
            position: relative;
            
            /* ★球体化1: 全体の内側に影と光を落として立体感を出す */
            box-shadow: 
                inset -10px -10px 20px rgba(0, 0, 0, 0.3), /* 右下の影 */
                inset 5px 5px 15px rgba(255, 255, 255, 0.2); /* 左上の環境光 */
            border-radius: 50%; /* 念のため明示 */
        }

        /* ★球体化2: 全体を覆う曲面シャドウ（ガラスの球体感） */
        .orb-container::after {
            content: '';
            position: absolute;
            inset: 0;
            border-radius: 50%;
            background: radial-gradient(circle at 30% 30%, rgba(255,255,255,0.1) 0%, rgba(0,0,0,0.05) 50%, rgba(0,0,0,0.4) 100%);
            z-index: 20; /* 液体より手前 */
            pointer-events: none;
        }

        /* ★球体化3: 左上の強いハイライト（ツヤ） */
        .orb-container::before {
            content: '';
            position: absolute;
            top: 15%;
            left: 18%;
            width: 25%;
            height: 12%;
            border-radius: 50%;
            background: radial-gradient(ellipse at center, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0) 70%);
            transform: rotate(-45deg);
            z-index: 21; /* 一番手前 */
            pointer-events: none;
            filter: blur(1px);
        }

        /* 泡のコンテナ（球体からはみ出ないようにマスク） */
        .bubble-container {
            position: absolute;
            left: 0;
            width: 100%;
            overflow: hidden;
            pointer-events: none;
            z-index: 5;
            border-radius: 50%; /* ★ここも丸くする */
        }
        
        @keyframes hint-pulse {
            0%, 100% { opacity: 0.3; }
            50% { opacity: 0.6; }
        }
    `;
    document.head.appendChild(styleFix);
}

// モジュールレベルの状態管理
let isTankListenerAttached = false;
let hasTeased = false; // ★追加: 初回のアニメーション実行済みフラグ
let latestBalance = 0;

/** @type {number} 現在の期間の純アルコール量(g) */
let latestPureAlcohol = 0;

/**
 * @param {number} currentBalanceKcal
 * @param {import('../types.js').Log[]} [periodLogs] - 期間内ログ（純アルコール計算用）
 */
export function renderBeerTank(currentBalanceKcal, periodLogs) {
    // 1. 最新のバランスをキャッシュ
    latestBalance = currentBalanceKcal;

    // 純アルコール量を計算・キャッシュ
    if (periodLogs) {
        latestPureAlcohol = Calc.calcTotalPureAlcohol(periodLogs);
    }

    const profile = Store.getProfile();
    const settings = {
        modes: Store.getModes(),
        baseExercise: Store.getBaseExercise()
    };

    const {
        canCount,
        displayMinutes,
        liquidColor,
        isHazy
    } = Calc.getTankDisplayData(currentBalanceKcal, StateManager.beerMode, settings, profile);

    // 要素を取得
    const liquidFront = DOM.elements['tank-liquid'] || document.getElementById('orb-liquid-front');
    const liquidBack = DOM.elements['tank-liquid-back'] || document.getElementById('orb-liquid-back');
    const cansText = DOM.elements['tank-cans'] || document.getElementById('tank-cans');
    const minText = DOM.elements['tank-minutes'] || document.getElementById('tank-minutes');
    const msgContainer = DOM.elements['tank-message'] || document.getElementById('tank-message');
    
    const tankWrapper = document.getElementById('tank-wrapper');
    const orbContainer = document.querySelector('.orb-container'); 
    
    if (!liquidFront || !liquidBack || !cansText || !minText || !msgContainer) return;

    // --- カード本体（Hero Card）を取得 ---
    const heroCard = tankWrapper.closest('.glass-panel');

    // --- ★追加: 視覚的なヒント（回転アイコン）の注入 ---
    if (heroCard && !document.getElementById('tank-flip-hint')) {
        const hintIcon = document.createElement('div');
        hintIcon.id = 'tank-flip-hint';
        // 右下に薄く配置
        hintIcon.className = 'absolute bottom-3 right-3 text-gray-400 dark:text-gray-500 pointer-events-none transition-opacity duration-500';
        hintIcon.style.animation = 'hint-pulse 3s infinite ease-in-out';
        hintIcon.innerHTML = `<i class="ph-bold ph-arrows-clockwise text-lg"></i>`;
        
        // 既存の相対配置コンテナであることを確認して追加
        if (getComputedStyle(heroCard).position === 'static') {
            heroCard.style.position = 'relative';
        }
        heroCard.appendChild(hintIcon);
    }

    // --- ★追加: "The Tease" (初回のみプルンと揺らす) ---
    if (heroCard && !hasTeased) {
        hasTeased = true;
        // 画面描画から少し遅らせて「気づかせる」
        setTimeout(() => {
            // ユーザーがまだ触っていなければ揺らす
            if (heroCard.dataset.isAnimating !== 'true') {
                heroCard.animate([
                    { transform: 'perspective(1000px) rotateY(0deg)' },
                    { transform: 'perspective(1000px) rotateY(15deg)' }, // 15度だけチラ見せ
                    { transform: 'perspective(1000px) rotateY(0deg)' }
                ], {
                    duration: 800,
                    easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' // バネのような動き
                });
            }
        }, 1500); // 1.5秒後に実行
    }

    // --- インタラクション: パネル全体を回転 ---
    if (!isTankListenerAttached && heroCard) {
        
        heroCard.style.cursor = 'pointer';

        heroCard.addEventListener('click', (e) => {
            // プルダウン等の操作時は無視
            if (e.target.closest('select') || e.target.closest('.ph-caret-down')) {
                return;
            }

            if (heroCard.dataset.isAnimating === 'true') return;
            heroCard.dataset.isAnimating = 'true';

            // ヒントアイコンがあれば、一度回したらもう消す（学習済みとみなす）
            const hint = document.getElementById('tank-flip-hint');
            if (hint) hint.style.opacity = '0';

            // 音再生
            if (AudioEngine) {
                AudioEngine.playTone(800, 'triangle', 0.05, 0, 0.05); 
            }

            // 1. 回転して消える
            const flipOut = heroCard.animate([
                { transform: 'perspective(1000px) rotateY(0deg)' },
                { transform: 'perspective(1000px) rotateY(90deg)' }
            ], {
                duration: 200, 
                easing: 'ease-in',
                fill: 'forwards'
            });

            flipOut.onfinish = () => {
                // 2. データ切り替え (3モード: cans → kcal → alcohol → cans)
                const currentMode = StateManager.orbViewMode || 'cans';
                const nextMode = currentMode === 'cans' ? 'kcal' : currentMode === 'kcal' ? 'alcohol' : 'cans';
                StateManager.setOrbViewMode(nextMode);
                
                renderBeerTank(latestBalance);

                // 3. 回転して戻る
                const flipIn = heroCard.animate([
                    { transform: 'perspective(1000px) rotateY(90deg)' },
                    { transform: 'perspective(1000px) rotateY(0deg)' }
                ], {
                    duration: 300, 
                    easing: 'ease-out',
                    fill: 'forwards'
                });

                if (AudioEngine) {
                   setTimeout(() => AudioEngine.playTone(600, 'sine', 0.1), 50);
                }

                flipIn.onfinish = () => {
                    heroCard.dataset.isAnimating = 'false';
                    flipOut.cancel(); 
                    flipIn.cancel();
                };
            };
        });
        
        isTankListenerAttached = true;
    }

    let msgText = msgContainer.querySelector('p');
    if (!msgText) {
        msgText = document.createElement('p');
        msgContainer.appendChild(msgText);
    }

    requestAnimationFrame(() => {
        // --- 1. 色と濁り ---
        liquidFront.style.background = liquidColor;
        liquidBack.style.background = liquidColor;
        
        if (isHazy) {
            liquidFront.style.filter = 'blur(1px) brightness(1.1)';
            liquidBack.style.filter = 'blur(2px) brightness(0.9)';
        } else {
            liquidFront.style.filter = 'none';
            liquidBack.style.filter = 'opacity(0.6)';
        }

        // --- 2. 状態リセット ---
        if (orbContainer) {
            orbContainer.classList.remove('zen-mode', 'tipsy-mode');
        }
        liquidFront.classList.remove('bubbling-liquid', 'high-pressure');

        let fillRatio = 0;

        // --- 3. Customモードバッジ ---
        // heroCard内ではなくtankWrapperに追加（配置位置の都合上）
        const mode = localStorage.getItem(APP.STORAGE_KEYS.PERIOD_MODE);
        const endDateTs = localStorage.getItem(APP.STORAGE_KEYS.PERIOD_END_DATE);
        const customLabel = localStorage.getItem(APP.STORAGE_KEYS.CUSTOM_LABEL);

        const existingCount = document.getElementById('tank-custom-countdown');
        if (existingCount) existingCount.remove();

        if (mode === 'custom' && endDateTs && tankWrapper) {
            const end = dayjs(parseInt(endDateTs));
            const now = dayjs();
            const daysLeft = end.diff(now, 'day');

            const badge = document.createElement('div');
            badge.id = 'tank-custom-countdown';
            badge.className = "absolute -top-3 -right-2 bg-white/90 dark:bg-base-900/90 backdrop-blur-md text-indigo-600 dark:text-indigo-400 shadow-sm border border-indigo-100 dark:border-indigo-900 rounded-lg px-3 py-1.5 z-50 flex flex-col items-center min-w-[80px]";
            badge.innerHTML = `
                <div class="text-[11px] font-bold uppercase tracking-wider leading-none mb-0.5 text-gray-400">${escapeHtml(customLabel || 'Project')}</div>
                <div class="text-xs font-black leading-none font-mono">
                    ${daysLeft >= 0 ? `${daysLeft}<span class="text-[11px] font-normal ml-0.5">days</span>` : 'END'}
                </div>
            `;
            tankWrapper.appendChild(badge);
        }

        const currentViewMode = StateManager.orbViewMode || 'cans';
        const unitEl = cansText.parentElement.querySelector('span:last-child');

        // --- 3.5. モードラベル更新 ---
        const modeLabel = document.getElementById('tank-mode-label');
        if (modeLabel) {
            modeLabel.textContent = currentViewMode === 'alcohol' ? 'Alcohol' : 'Balance';
        }

        // --- 4. モード別表示ロジック ---
        if (currentBalanceKcal >= 0) {
            // === Zen Mode (貯金) ===
            liquidFront.style.opacity = '0';
            liquidBack.style.opacity = '0';

            const existingBubbles = orbContainer.querySelector('.bubble-container');
            if (existingBubbles) existingBubbles.remove();
            
            if (orbContainer) orbContainer.classList.add('zen-mode');

            if (currentViewMode === 'kcal') {
                cansText.textContent = `+${Math.round(currentBalanceKcal).toLocaleString()}`;
                if(unitEl) unitEl.textContent = 'kcal';
                cansText.style.fontSize = Math.round(currentBalanceKcal) > 9999 ? '2.0rem' : '2.5rem';
            } else if (currentViewMode === 'alcohol') {
                cansText.textContent = `${Math.round(latestPureAlcohol)}`;
                if(unitEl) unitEl.textContent = 'g';
                cansText.style.fontSize = '';
            } else {
                cansText.textContent = `+${canCount.toFixed(1)}`;
                if(unitEl) unitEl.textContent = 'cans';
                cansText.style.fontSize = '';
            }
            
            if (currentViewMode === 'alcohol') {
                cansText.className = "text-4xl font-black text-indigo-600 dark:text-indigo-400 drop-shadow-sm font-numeric";
                minText.innerHTML = `<span class="text-[11px] font-normal opacity-70">Pure Alcohol (period)</span>`;
                minText.className = 'text-sm font-bold text-indigo-600 dark:text-indigo-400';
                msgText.textContent = latestPureAlcohol === 0 ? 'No alcohol yet' : 'Tap to switch view';
                msgText.className = 'text-sm font-bold text-gray-400 dark:text-gray-500';
            } else {
                cansText.className = "text-4xl font-black text-emerald-600 dark:text-emerald-400 drop-shadow-sm font-numeric";
                minText.innerHTML = `${Math.round(Math.abs(displayMinutes))} min <span class="text-[11px] font-normal text-emerald-600/70 dark:text-emerald-200">to burn</span>`;
                minText.className = 'text-sm font-bold text-emerald-600 dark:text-emerald-400';

                if (canCount < 0.5) {
                    msgText.textContent = 'Perfect Balance!';
                    msgText.className = 'text-sm font-bold text-emerald-600 dark:text-emerald-400';
                } else if (canCount < 2.0) {
                    msgText.textContent = 'Great Condition!';
                    msgText.className = 'text-sm font-bold text-emerald-600 dark:text-emerald-400 animate-pulse';
                } else {
                    msgText.textContent = 'You are GOD!';
                    msgText.className = 'text-sm font-bold text-purple-600 dark:text-purple-400 animate-bounce';
                }
            }

        } else {
            // === Debt Mode (借金) ===
            liquidFront.style.opacity = '1';
            liquidBack.style.opacity = '0.5';

            const debtCans = Math.abs(canCount);
            const rawRatio = (debtCans / APP.TANK_MAX_CANS) * 100;
            fillRatio = Math.max(10, Math.min(94, rawRatio));

            const topVal = 100 - fillRatio; 

            let bubbleContainer = orbContainer.querySelector('.bubble-container');
            if (!bubbleContainer) {
                bubbleContainer = document.createElement('div');
                bubbleContainer.className = 'bubble-container';
                orbContainer.appendChild(bubbleContainer);
                for (let i = 0; i < 10; i++) {
                    const bubble = document.createElement('div');
                    bubble.className = 'bubble-particle';
                    const size = Math.random() * 5 + 2; 
                    const left = Math.random() * 80 + 10; 
                    const duration = Math.random() * 3 + 4; 
                    const delay = Math.random() * 7; 
                    bubble.style.width = `${size}px`;
                    bubble.style.height = `${size}px`;
                    bubble.style.left = `${left}%`;
                    bubble.style.animationDuration = `${duration}s`;
                    bubble.style.animationDelay = `-${delay}s`;
                    bubbleContainer.appendChild(bubble);
                }
            }

            // ★ここが重要: 泡の箱のサイズをビールの液体部分にピッタリ合わせる
            if (bubbleContainer) {
                bubbleContainer.style.top = `${topVal}%`;     // 天井を水面に合わせる
                bubbleContainer.style.height = `${fillRatio}%`; // 底までを覆う
            }

            if (debtCans > 2.5) {
                if (orbContainer) orbContainer.classList.add('tipsy-mode');
            }

            if (currentViewMode === 'kcal') {
                cansText.textContent = Math.round(Math.abs(currentBalanceKcal)).toLocaleString();
                if(unitEl) unitEl.textContent = 'kcal';
                cansText.style.fontSize = Math.round(Math.abs(currentBalanceKcal)) > 9999 ? '2.0rem' : '2.5rem';
            } else if (currentViewMode === 'alcohol') {
                cansText.textContent = `${Math.round(latestPureAlcohol)}`;
                if(unitEl) unitEl.textContent = 'g';
                cansText.style.fontSize = '';
            } else {
                cansText.textContent = Math.abs(canCount).toFixed(1);
                if(unitEl) unitEl.textContent = 'cans';
                cansText.style.fontSize = '';
            }

            if (currentViewMode === 'alcohol') {
                cansText.className = "text-4xl font-black text-indigo-600 dark:text-indigo-400 drop-shadow-sm font-numeric";
                minText.innerHTML = `<span class="text-[11px] font-normal opacity-70">Pure Alcohol (period)</span>`;
                minText.className = 'text-sm font-bold text-indigo-600 dark:text-indigo-400';
                msgText.textContent = 'Tap to switch view';
                msgText.className = 'text-sm font-bold text-gray-400 dark:text-gray-500';
            } else {
                cansText.className = "text-4xl font-black text-red-500 dark:text-red-400 drop-shadow-sm font-numeric";
                minText.innerHTML = `${Math.round(Math.abs(displayMinutes))} min <span class="text-[11px] font-normal opacity-70">to burn</span>`;
                minText.className = 'text-sm font-bold text-red-500 dark:text-red-400';

                if (debtCans > 2.5) {
                    msgText.textContent = 'Too much fun?';
                    msgText.className = 'text-sm font-bold text-orange-500 dark:text-orange-400';
                } else if (debtCans > 1.0) {
                    msgText.textContent = `Let's walk it off.`;
                    msgText.className = 'text-sm font-bold text-gray-500 dark:text-gray-400';
                } else {
                    msgText.textContent = 'Enjoying beer!';
                    msgText.className = 'text-sm font-bold text-gray-400 dark:text-gray-500';
                }
            }
        }

        const topVal = 100 - fillRatio;
        liquidFront.style.top = `${topVal}%`;
        liquidBack.style.top = `${topVal + 2}%`; 
    });
}

