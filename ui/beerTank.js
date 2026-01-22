import { APP, EXERCISE } from '../constants.js';
import { Calc } from '../logic.js';
import { Store } from '../store.js';
import { StateManager } from './state.js';
import { DOM, escapeHtml } from './dom.js';

export function renderBeerTank(currentBalanceKcal) {
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
    
    if (!liquidFront || !liquidBack || !cansText || !minText || !msgContainer) return;
    
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

        // --- 3. モード別表示ロジック ---
        if (currentBalanceKcal >= 0) {
            // === Zen Mode (貯金) ===
            // 液体を隠す
            liquidFront.style.opacity = '0';
            liquidBack.style.opacity = '0';
            
            // 禅モード(黄金の光)ON
            if (orbContainer) orbContainer.classList.add('zen-mode');

            // テキスト表示
            cansText.textContent = `+${canCount.toFixed(1)}`;
            cansText.className = "text-4xl font-black text-emerald-600 dark:text-emerald-400 drop-shadow-sm";
            
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
            // Level 1: 常に炭酸の泡を出す
            liquidFront.classList.add('bubbling-liquid');

            // Level 2: 借金1.5本超え -> 泡を少し激しく
            if (debtCans > 1.5) {
                liquidFront.classList.add('high-pressure');
            }

            // Level 3: 借金2.5本超え -> ほろ酔いモード (ゆらゆら揺れる)
            if (debtCans > 2.5) {
                if (orbContainer) orbContainer.classList.add('tipsy-mode');
            }

            // テキスト更新
            cansText.textContent = canCount.toFixed(1);
            cansText.className = "text-4xl font-black text-red-500 dark:text-red-400 drop-shadow-sm";

            minText.innerHTML = `${Math.round(Math.abs(displayMinutes))} min <span class="text-[10px] font-normal opacity-70">to burn</span>`;
            minText.className = 'text-sm font-bold text-red-500 dark:text-red-400';
            
            // メッセージ (マイルドな表現に変更)
            if (debtCans > 2.5) {
                msgText.textContent = 'Too much fun?'; // 楽しみすぎた？
                msgText.className = 'text-sm font-bold text-orange-500 dark:text-orange-400';
            } else if (debtCans > 1.0) {
                msgText.textContent = `Let's walk it off.`; // 歩いて返そう
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