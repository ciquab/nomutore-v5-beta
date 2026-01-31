import { APP, EXERCISE } from '../constants.js';
import { Calc } from '../logic.js';
import { Store } from '../store.js';
import { StateManager } from './state.js';
import { DOM, escapeHtml, AudioEngine } from './dom.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

// モジュールレベルの状態管理
let isTankListenerAttached = false;
let latestBalance = 0;

export function renderBeerTank(currentBalanceKcal) {
    // 1. 最新のバランスをキャッシュ
    latestBalance = currentBalanceKcal;

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
    
    // コンテナ
    const tankWrapper = document.getElementById('tank-wrapper');
    const orbContainer = document.querySelector('.orb-container'); 
    
    if (!liquidFront || !liquidBack || !cansText || !minText || !msgContainer) return;
    
    // --- ★変更点: WAAPIによる強制アニメーション ---
    if (!isTankListenerAttached && orbContainer) {
        
        orbContainer.style.cursor = 'pointer';

        orbContainer.addEventListener('click', (e) => {
            // アニメーション中なら無視 (data属性で管理)
            if (orbContainer.dataset.isAnimating === 'true') return;
            orbContainer.dataset.isAnimating = 'true';

            // 音再生
            if (window.AudioEngine) {
                window.AudioEngine.playTone(800, 'triangle', 0.05, 0, 0.05); 
            }

            // 1. 回転して消える (0deg -> 90deg)
            // CSSクラスを使わず、アニメーションエンジンを直接叩きます
            const flipOut = orbContainer.animate([
                { transform: 'perspective(1000px) rotateY(0deg)' },
                { transform: 'perspective(1000px) rotateY(90deg)' }
            ], {
                duration: 250,
                easing: 'ease-in',
                fill: 'forwards' // 終わった状態で止める
            });

            flipOut.onfinish = () => {
                // 2. データを切り替える（見えない一瞬の間に）
                const currentMode = StateManager.orbViewMode || 'cans';
                StateManager.setOrbViewMode(currentMode === 'cans' ? 'kcal' : 'cans');
                
                // 再描画
                renderBeerTank(latestBalance);

                // 3. 回転して戻る (90deg -> 0deg)
                const flipIn = orbContainer.animate([
                    { transform: 'perspective(1000px) rotateY(90deg)' },
                    { transform: 'perspective(1000px) rotateY(0deg)' }
                ], {
                    duration: 300,
                    easing: 'ease-out',
                    fill: 'forwards'
                });

                // 完了音
                if (window.AudioEngine) {
                   setTimeout(() => window.AudioEngine.playTone(600, 'sine', 0.1), 50);
                }

                flipIn.onfinish = () => {
                    // クリーンアップ
                    orbContainer.dataset.isAnimating = 'false';
                    flipOut.cancel(); // メモリ解放＆スタイル解除
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
        // --- 1. 色と濁り [維持] ---
        liquidFront.style.background = liquidColor;
        liquidBack.style.background = liquidColor;
        
        if (isHazy) {
            liquidFront.style.filter = 'blur(1px) brightness(1.1)';
            liquidBack.style.filter = 'blur(2px) brightness(0.9)';
        } else {
            liquidFront.style.filter = 'none';
            liquidBack.style.filter = 'opacity(0.6)';
        }

        // --- 2. 状態のリセット [維持] ---
        if (orbContainer) {
            orbContainer.classList.remove('zen-mode', 'tipsy-mode');
        }
        liquidFront.classList.remove('bubbling-liquid', 'high-pressure');

        let fillRatio = 0;

        // --- 3. Customモードバッジ [維持] ---
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
                <div class="text-[9px] font-bold uppercase tracking-wider leading-none mb-0.5 text-gray-400">${escapeHtml(customLabel || 'Project')}</div>
                <div class="text-xs font-black leading-none font-mono">
                    ${daysLeft >= 0 ? `${daysLeft}<span class="text-[9px] font-normal ml-0.5">days</span>` : 'END'}
                </div>
            `;
            tankWrapper.appendChild(badge);
        }

        const currentViewMode = StateManager.orbViewMode || 'cans';

        // --- 4. モード別表示 [維持] ---
        if (currentBalanceKcal >= 0) {
            // === Zen Mode ===
            liquidFront.style.opacity = '0';
            liquidBack.style.opacity = '0';

            const existingBubbles = orbContainer.querySelector('.bubble-container');
            if (existingBubbles) existingBubbles.remove();
            
            if (orbContainer) orbContainer.classList.add('zen-mode');

            if (currentViewMode === 'kcal') {
                cansText.textContent = `+${Math.round(currentBalanceKcal).toLocaleString()}`;
                const unitEl = cansText.parentElement.querySelector('span:last-child');
                if(unitEl) unitEl.textContent = 'kcal';
                cansText.style.fontSize = Math.round(currentBalanceKcal) > 9999 ? '2.0rem' : '2.5rem';
            } else {
                cansText.textContent = `+${canCount.toFixed(1)}`;
                const unitEl = cansText.parentElement.querySelector('span:last-child');
                if(unitEl) unitEl.textContent = 'cans';
                cansText.style.fontSize = '';
            }
            
            cansText.className = "text-4xl font-black text-emerald-600 dark:text-emerald-400 drop-shadow-sm font-numeric";
            
            minText.innerHTML = `${Math.round(Math.abs(displayMinutes))} min <span class="text-[10px] font-normal text-emerald-600/70 dark:text-emerald-200">to burn</span>`;
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

        } else {
            // === Debt Mode ===
            liquidFront.style.opacity = '1';
            liquidBack.style.opacity = '0.5';

            const debtCans = Math.abs(canCount);
            const rawRatio = (debtCans / APP.TANK_MAX_CANS) * 100;
            fillRatio = Math.max(10, Math.min(94, rawRatio)); 

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

            if (debtCans > 2.5) {
                if (orbContainer) orbContainer.classList.add('tipsy-mode');
            }

            if (currentViewMode === 'kcal') {
                cansText.textContent = Math.round(Math.abs(currentBalanceKcal)).toLocaleString();
                const unitEl = cansText.parentElement.querySelector('span:last-child');
                if(unitEl) unitEl.textContent = 'kcal';
                cansText.style.fontSize = Math.round(Math.abs(currentBalanceKcal)) > 9999 ? '2.0rem' : '2.5rem';
            } else {
                cansText.textContent = canCount.toFixed(1);
                const unitEl = cansText.parentElement.querySelector('span:last-child');
                if(unitEl) unitEl.textContent = 'cans';
                cansText.style.fontSize = '';
            }

            cansText.className = "text-4xl font-black text-red-500 dark:text-red-400 drop-shadow-sm font-numeric";

            minText.innerHTML = `${Math.round(Math.abs(displayMinutes))} min <span class="text-[10px] font-normal opacity-70">to burn</span>`;
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

        const topVal = 100 - fillRatio;
        liquidFront.style.top = `${topVal}%`;
        liquidBack.style.top = `${topVal + 2}%`; 
    });
}
