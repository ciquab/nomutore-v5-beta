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

    const liquidFront = DOM.elements['tank-liquid'] || document.getElementById('orb-liquid-front');
    const liquidBack = DOM.elements['tank-liquid-back'] || document.getElementById('orb-liquid-back');
    
    const cansText = DOM.elements['tank-cans'] || document.getElementById('tank-cans');
    const minText = DOM.elements['tank-minutes'] || document.getElementById('tank-minutes');
    const msgContainer = DOM.elements['tank-message'] || document.getElementById('tank-message');
    const orbContainer = document.querySelector('.orb-container');
    
    if (!liquidFront || !liquidBack || !cansText || !minText || !msgContainer) return;
    
    let msgText = msgContainer.querySelector('p');
    if (!msgText) {
        msgText = document.createElement('p');
        msgContainer.appendChild(msgText);
    }

    requestAnimationFrame(() => {
        // --- Color & Hazy Effect ---
        liquidFront.style.background = liquidColor;
        liquidBack.style.background = liquidColor;
        
        if (isHazy) {
            liquidFront.style.filter = 'blur(1px) brightness(1.1)';
            liquidBack.style.filter = 'blur(2px) brightness(0.9)';
        } else {
            liquidFront.style.filter = 'none';
            liquidBack.style.filter = 'opacity(0.6)';
        }

        let fillRatio = 0;

        // ★修正: v4ロジック (借金 = 液体 / 完済 = 光)
        if (currentBalanceKcal >= 0) {
            // --- Zen Mode (完済) ---
            // 液体は消える
            liquidFront.style.opacity = '0';
            liquidBack.style.opacity = '0';
            
            if (orbContainer) orbContainer.classList.add('zen-mode');

            // テキスト表示 (貯金)
            const rawRatio = (canCount / APP.TANK_MAX_CANS) * 100;
            // 貯金があっても液体は増やさない（光の強さなどで表現も可能だが今回は消す）
            fillRatio = 0; 

            cansText.textContent = `+${canCount.toFixed(1)}`;
            cansText.className = "text-4xl font-black text-emerald-600 dark:text-emerald-400 drop-shadow-sm";
            
            const safeIcon = escapeHtml(baseExData.icon);
            minText.innerHTML = `+${Math.round(displayMinutes)} min <span class="text-[10px] font-normal opacity-70">(${safeIcon})</span>`;
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
            // --- Debt Mode (借金) ---
            // 液体が出現
            liquidFront.style.opacity = '1';
            liquidBack.style.opacity = '0.5'; // Back layer opacity defaults
            
            if (orbContainer) orbContainer.classList.remove('zen-mode');

            // 借金量に応じて液体が増える (最大3本分で100%)
            const debtCans = Math.abs(canCount);
            const rawRatio = (debtCans / APP.TANK_MAX_CANS) * 100;
            fillRatio = Math.max(10, Math.min(100, rawRatio)); // 最低10%は表示

            cansText.textContent = canCount.toFixed(1);
            cansText.className = "text-4xl font-black text-red-500 dark:text-red-400 drop-shadow-sm";

            const safeIcon = escapeHtml(baseExData.icon);
            minText.innerHTML = `${Math.round(Math.abs(displayMinutes))} min <span class="text-[10px] font-normal opacity-70">to burn</span>`;
            minText.className = 'text-sm font-bold text-red-500 dark:text-red-400';
            
            if (debtCans > 2.5) {
                msgText.textContent = 'Heavy Debt... Move now!';
                msgText.className = 'text-sm font-bold text-red-600 dark:text-red-400 animate-pulse';
            } else if (debtCans > 1.0) {
                msgText.textContent = `Recovery Needed...`;
                msgText.className = 'text-sm font-bold text-orange-500 dark:text-orange-400';
            } else {
                msgText.textContent = 'Light Debt.';
                msgText.className = 'text-sm font-bold text-gray-500 dark:text-gray-400';
            }
        }

        const topVal = 100 - fillRatio;
        liquidFront.style.top = `${topVal}%`;
        liquidBack.style.top = `${topVal + 2}%`; 
    });
}