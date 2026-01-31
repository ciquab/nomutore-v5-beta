import { APP, EXERCISE } from '../constants.js';
import { Calc } from '../logic.js';
import { Store } from '../store.js';
import { StateManager } from './state.js';
import { DOM, escapeHtml, AudioEngine } from './dom.js'; // AudioEngineを追加
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

const styleFix = document.createElement('style');
styleFix.innerHTML = `
    .perspective-1000 { perspective: 1000px; }
    .flip-card-inner { transition: transform 0.6s cubic-bezier(0.4, 0.0, 0.2, 1) !important; transform-style: preserve-3d; }
    .is-flipped-90 { transform: rotateY(90deg) !important; }
`;
document.head.appendChild(styleFix);

// モジュールレベルの状態管理
let isTankListenerAttached = false;
let orbViewMode = 'cans'; // 'cans' | 'kcal'
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

    // IDで要素を取得
    const liquidFront = DOM.elements['tank-liquid'] || document.getElementById('orb-liquid-front');
    const liquidBack = DOM.elements['tank-liquid-back'] || document.getElementById('orb-liquid-back');
    const cansText = DOM.elements['tank-cans'] || document.getElementById('tank-cans');
    const minText = DOM.elements['tank-minutes'] || document.getElementById('tank-minutes');
    const msgContainer = DOM.elements['tank-message'] || document.getElementById('tank-message');
    
    // オーブの親要素（揺れ用）と枠線（禅モード用）を取得
    const orbContainer = document.querySelector('.orb-container'); 
    // ★追加: 新しいラッパーを取得
    const tankWrapper = document.getElementById('tank-wrapper');
    
    if (!liquidFront || !liquidBack || !cansText || !minText || !msgContainer) return;
    
    // --- ★追加: タップで表示モード切り替え (Click to Toggle) ---
    if (!isTankListenerAttached && orbContainer) {
        orbContainer.style.cursor = 'pointer';
        
        // タップ時の縮小エフェクト用クラス
        orbContainer.classList.add('transition-transform', 'active:scale-95');

        orbContainer.addEventListener('click', (e) => {
            // 1. モードをトグル
            orbViewMode = (orbViewMode === 'cans') ? 'kcal' : 'cans';
            
            // 2. 音でフィードバック (ポンッという軽い音)
            if (window.AudioEngine) {
                window.AudioEngine.playTone(600, 'sine', 0.05);
            }
            
            // 3. 即座に再描画 (キャッシュした最新バランスを使用)
            renderBeerTank(latestBalance);
        });
        
        isTankListenerAttached = true;
    }

    let msgText = msgContainer.querySelector('p');
    if (!msgText) {
        msgText = document.createElement('p');
        msgContainer.appendChild(msgText);
    }

    requestAnimationFrame(() => {
        // --- 1. 色と濁り (Hazy) の適用 ---
        liquidFront.style.background = liquidColor;
        liquidBack.style.background = liquidColor;
        
        if (isHazy) {
            liquidFront.style.filter = 'blur(1px) brightness(1.1)';
            liquidBack.style.filter = 'blur(2px) brightness(0.9)';
        } else {
            liquidFront.style.filter = 'none';
            liquidBack.style.filter = 'opacity(0.6)';
        }

        // --- 2. 状態のリセット (演出クラスを一旦外す) ---
        if (orbContainer) {
            orbContainer.classList.remove('zen-mode', 'tipsy-mode');
        }
        liquidFront.classList.remove('bubbling-liquid', 'high-pressure');

        let fillRatio = 0;

        // --- Customモード時の残り日数カウントダウン ---
        const mode = localStorage.getItem(APP.STORAGE_KEYS.PERIOD_MODE);
        const endDateTs = localStorage.getItem(APP.STORAGE_KEYS.PERIOD_END_DATE);
        const customLabel = localStorage.getItem(APP.STORAGE_KEYS.CUSTOM_LABEL);

        // 既存のCountdown要素があれば削除（重複防止）
        const existingCount = document.getElementById('tank-custom-countdown');
        if (existingCount) existingCount.remove();

        if (mode === 'custom' && endDateTs) {
            const end = dayjs(parseInt(endDateTs));
            const now = dayjs();
            const daysLeft = end.diff(now, 'day'); // 残り日数

            if (tankWrapper) {
                const badge = document.createElement('div');
                badge.id = 'tank-custom-countdown';
                
                // ★修正: 原色ベタ塗りをやめ、Glassmorphism調の控えめなデザインに変更
                badge.className = "absolute -top-3 -right-2 bg-white/90 dark:bg-base-900/90 backdrop-blur-md text-indigo-600 dark:text-indigo-400 shadow-sm border border-indigo-100 dark:border-indigo-900 rounded-lg px-3 py-1.5 z-50 flex flex-col items-center min-w-[80px]";
                
                badge.innerHTML = `
                    <div class="text-[9px] font-bold uppercase tracking-wider leading-none mb-0.5 text-gray-400">${escapeHtml(customLabel || 'Project')}</div>
                    <div class="text-xs font-black leading-none font-mono">
                        ${daysLeft >= 0 ? `${daysLeft}<span class="text-[9px] font-normal ml-0.5">days</span>` : 'END'}
                    </div>
                `;
                tankWrapper.appendChild(badge);
            }
        }

        // --- 3. モード別表示ロジック ---
        if (currentBalanceKcal >= 0) {
            // === Zen Mode (貯金) ===
            // 液体を隠す
            liquidFront.style.opacity = '0';
            liquidBack.style.opacity = '0';

            // ★ここに追加: 貯金モードになったら泡を削除してリセットする
            const existingBubbles = orbContainer.querySelector('.bubble-container');
            if (existingBubbles) existingBubbles.remove();
            
            // 禅モード(黄金の光)ON
            if (orbContainer) orbContainer.classList.add('zen-mode');

            // --- テキスト表示 (切り替え対応) ---
            if (orbViewMode === 'kcal') {
                // kcalモード
                cansText.textContent = `+${Math.round(currentBalanceKcal).toLocaleString()}`;
                cansText.nextElementSibling.textContent = 'kcal'; // 単位更新(HTML構造に依存、なければ無視)
            } else {
                // cansモード
                cansText.textContent = `+${canCount.toFixed(1)}`;
                const unitEl = cansText.parentElement.querySelector('span:last-child');
                if(unitEl) unitEl.textContent = 'cans';
            }
            
            cansText.className = "text-4xl font-black text-emerald-600 dark:text-emerald-400 drop-shadow-sm font-numeric";
            
            minText.innerHTML = `${Math.round(Math.abs(displayMinutes))} min <span class="text-[10px] font-normal text-emerald-600/70 dark:text-emerald-200">to burn</span>`;
            minText.className = 'text-sm font-bold text-emerald-600 dark:text-emerald-400';

            // メッセージ
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
            // 液体を表示
            liquidFront.style.opacity = '1';
            liquidBack.style.opacity = '0.5';

            const debtCans = Math.abs(canCount);
            const rawRatio = (debtCans / APP.TANK_MAX_CANS) * 100;
            
            // ★重要: 94%で止めて、満タン時でも波が見えるようにする
            fillRatio = Math.max(10, Math.min(94, rawRatio)); 

            // --- 演出ロジック ---
            // ★修正: 生成場所を liquidFront ではなく orbContainer に変更！
            let bubbleContainer = orbContainer.querySelector('.bubble-container');
            if (!bubbleContainer) {
                bubbleContainer = document.createElement('div');
                bubbleContainer.className = 'bubble-container';
                // orbContainer(枠)に追加
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

            // Level 3: 借金2.5本超え -> ほろ酔いモード
            if (debtCans > 2.5) {
                if (orbContainer) orbContainer.classList.add('tipsy-mode');
            }

            // --- テキスト表示 (切り替え対応) ---
            if (orbViewMode === 'kcal') {
                // kcalモード (借金はマイナス表示せずに絶対値にするか、そのままか。ここでは見やすく整数で)
                cansText.textContent = Math.round(Math.abs(currentBalanceKcal)).toLocaleString();
                const unitEl = cansText.parentElement.querySelector('span:last-child');
                if(unitEl) unitEl.textContent = 'kcal';
            } else {
                // cansモード
                cansText.textContent = canCount.toFixed(1);
                const unitEl = cansText.parentElement.querySelector('span:last-child');
                if(unitEl) unitEl.textContent = 'cans';
            }

            cansText.className = "text-4xl font-black text-red-500 dark:text-red-400 drop-shadow-sm font-numeric";

            minText.innerHTML = `${Math.round(Math.abs(displayMinutes))} min <span class="text-[10px] font-normal opacity-70">to burn</span>`;
            minText.className = 'text-sm font-bold text-red-500 dark:text-red-400';
            
            // メッセージ
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

        // 液体の高さを適用 (波打つため top を操作)
        const topVal = 100 - fillRatio;
        liquidFront.style.top = `${topVal}%`;
        liquidBack.style.top = `${topVal + 2}%`; 
    });
}

