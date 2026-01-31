import { APP, EXERCISE } from '../constants.js';
import { Calc } from '../logic.js';
import { Store } from '../store.js';
import { StateManager } from './state.js';
import { DOM, escapeHtml, AudioEngine } from './dom.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

// --- キャッシュ対策: 親要素の遠近感設定 (CSS強制注入) ---
const styleId = 'nomutore-tank-anim-style';
if (!document.getElementById(styleId)) {
    const styleFix = document.createElement('style');
    styleFix.id = styleId;
    styleFix.innerHTML = `
        #tank-wrapper {
            perspective: 1000px !important;
            -webkit-perspective: 1000px !important;
        }
        .orb-container {
            transform-style: preserve-3d !important;
            -webkit-transform-style: preserve-3d !important;
            will-change: transform; 
        }
    `;
    document.head.appendChild(styleFix);
}

// モジュールレベルの状態管理
let isTankListenerAttached = false;
let latestBalance = 0;    // クリックイベント用に最新バランスを保持

export function renderBeerTank(currentBalanceKcal) {
    // 1. 最新のバランスをキャッシュ（クリック時の再描画用）
    latestBalance = currentBalanceKcal;

    const profile = Store.getProfile();
    const settings = {
        modes: Store.getModes(),
        baseExercise: Store.getBaseExercise()
    };

    const { 
        canCount, 
        displayMinutes, 
        baseExData, 
        unitKcal, 
        targetStyle,
        liquidColor,
        isHazy 
    } = Calc.getTankDisplayData(currentBalanceKcal, StateManager.beerMode, settings, profile);

    // 要素を取得
    const liquidFront = DOM.elements['tank-liquid'] || document.getElementById('orb-liquid-front');
    const liquidBack = DOM.elements['tank-liquid-back'] || document.getElementById('orb-liquid-back');
    const cansText = DOM.elements['tank-cans'] || document.getElementById('tank-cans');
    const minText = DOM.elements['tank-minutes'] || document.getElementById('tank-minutes');
    const msgContainer = DOM.elements['tank-message'] || document.getElementById('tank-message');
    
    // アニメーション用ラッパーとコンテナ
    const tankWrapper = document.getElementById('tank-wrapper');
    const orbContainer = document.querySelector('.orb-container'); 
    
    if (!liquidFront || !liquidBack || !cansText || !minText || !msgContainer) return;
    
    // --- ★インタラクション: タップでフリップアニメーション (JS直接制御版) ---
    if (!isTankListenerAttached && orbContainer) {
        
        // タップ可能であることを示す
        orbContainer.style.cursor = 'pointer';

        orbContainer.addEventListener('click', (e) => {
            // 連打防止: すでに回転中(styleにtransformが入っている)なら無視
            if (orbContainer.style.transform && orbContainer.style.transform !== '') return;

            // --- Phase 1: 90度まで回転 (隠す) ---
            orbContainer.style.transition = 'transform 0.3s ease-in';
            orbContainer.style.transform = 'rotateY(90deg)';

            // 音でフィードバック
            if (window.AudioEngine) {
                window.AudioEngine.playTone(800, 'triangle', 0.05, 0, 0.05); 
            }
            
            // --- Phase 2: データ更新して戻す (0.3s後) ---
            setTimeout(() => {
                // モードをトグル
                const currentMode = StateManager.orbViewMode || 'cans';
                StateManager.setOrbViewMode(currentMode === 'cans' ? 'kcal' : 'cans');
                
                // 再描画 (データ更新)
                renderBeerTank(latestBalance);
                
                // 回転を戻す (0度に戻す)
                orbContainer.style.transition = 'transform 0.3s ease-out';
                orbContainer.style.transform = 'rotateY(0deg)'; 
                
                // 完了音
                if (window.AudioEngine) {
                   setTimeout(() => window.AudioEngine.playTone(600, 'sine', 0.1), 100);
                }

                // --- Phase 3: クリーンアップ (さらに0.3s後) ---
                setTimeout(() => {
                    // 次のクリックのためにスタイルをクリア
                    orbContainer.style.transition = '';
                    orbContainer.style.transform = '';
                }, 300);

            }, 300); 
        });
        
        isTankListenerAttached = true;
    }

    let msgText = msgContainer.querySelector('p');
    if (!msgText) {
        msgText = document.createElement('p');
        msgContainer.appendChild(msgText);
    }

    requestAnimationFrame(() => {
        // --- 1. 色と濁り (Hazy) の適用 [維持] ---
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

        // --- 3. Customモード時の残り日数バッジ [維持] ---
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

        // 現在の表示モードを取得
        const currentViewMode = StateManager.orbViewMode || 'cans';

        // --- 4. モード別表示ロジック ---
        if (currentBalanceKcal >= 0) {
            // === Zen Mode (貯金) ===
            liquidFront.style.opacity = '0';
            liquidBack.style.opacity = '0';

            // 貯金モード時は泡を削除 [維持・最適化]
            const existingBubbles = orbContainer.querySelector('.bubble-container');
            if (existingBubbles) existingBubbles.remove();
            
            if (orbContainer) orbContainer.classList.add('zen-mode');

            // --- テキスト表示 (切り替え対応) ---
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
            // === Debt Mode (借金) ===
            liquidFront.style.opacity = '1';
            liquidBack.style.opacity = '0.5';

            const debtCans = Math.abs(canCount);
            const rawRatio = (debtCans / APP.TANK_MAX_CANS) * 100;
            fillRatio = Math.max(10, Math.min(94, rawRatio)); 

            // 泡エフェクト [維持]
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

            // Tipsy Mode (ほろ酔い) [維持]
            if (debtCans > 2.5) {
                if (orbContainer) orbContainer.classList.add('tipsy-mode');
            }

            // --- テキスト表示 (切り替え対応) ---
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
            
            // メッセージ [維持]
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
