/* ui/timer.js */
import { APP, EXERCISE, BEER_COLORS, CALORIES } from '../constants.js'; 
import { Calc } from '../logic.js';
import { Store } from '../store.js';
import { toggleModal, Feedback } from './dom.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

let timerInterval = null;
let isRunning = false;
let lastBurnedKcal = 0;
let accumulatedTime = 0;
let currentBeerStyleName = null; 
let lastTickSec = 0;

const formatTime = (ms) => {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export const Timer = {
    init: () => {
        console.log('[Timer] init called');
        const el = document.getElementById('timer-exercise-select');
        if (el && el.children.length === 0) {
            Object.keys(EXERCISE).forEach(k => {
                const o = document.createElement('option');
                o.value = k;
                o.textContent = EXERCISE[k].icon + ' ' + EXERCISE[k].label;
                el.appendChild(o);
            });
            el.value = Store.getDefaultRecordExercise();
        }
        Timer.checkResume();
    },

    checkResume: () => {
        const start = localStorage.getItem(APP.STORAGE_KEYS.TIMER_START);
        const accumulated = parseInt(localStorage.getItem(APP.STORAGE_KEYS.TIMER_ACCUMULATED)) || 0;
        
        if (!currentBeerStyleName) {
            Timer.setRandomBeerBackground();
        }

        if (start) {
            // 【修正】リロード復帰時、accumulatedTime を再計算してから start() を呼ぶ
            // これがないと accumulatedTime=0 のまま start() が走り、時間がリセットされてしまう
            const startTimeVal = parseInt(start);
            accumulatedTime = Date.now() - startTimeVal;

            Timer.start(); 
            toggleModal('timer-modal', true);
        } else if (accumulated > 0) {
            // 一時停止状態の復元
            accumulatedTime = accumulated; // 変数にも戻す
            isRunning = false;
            Timer.updateUI(false);
            
            const totalMs = accumulated;
            const display = document.getElementById('timer-display');
            if(display) display.textContent = formatTime(totalMs);
            Timer.updateCalculations(totalMs);
        }
    },

    setRandomBeerBackground: () => {
        try {
            const colors = (typeof BEER_COLORS !== 'undefined') ? BEER_COLORS : { 'Golden Ale': 'linear-gradient(to top, #eab308, #facc15)' };
            const styleKeys = Object.keys(colors);
            const randomKey = styleKeys[Math.floor(Math.random() * styleKeys.length)];
            let backgroundStyle = colors[randomKey];

            if (backgroundStyle.startsWith('#')) {
                backgroundStyle = `linear-gradient(to bottom right, ${backgroundStyle}, #1a1a1a)`;
            }
            
            currentBeerStyleName = randomKey;

            const modal = document.getElementById('timer-modal');
            if (modal) {
                modal.classList.remove('bg-base-900');
                modal.style.background = backgroundStyle;
            }
        } catch(e) {
            console.error('[Timer] BG Error:', e);
        }
    },

    toggle: () => {
        console.log('[Timer] toggle called. isRunning:', isRunning);
        if (isRunning) {
            Timer.pause();
            if (Feedback && Feedback.haptic) Feedback.haptic.medium();
        } else {
            console.log('[Timer] Attempting to start...');
            Timer.start();
            console.log('[Timer] Start executed.');
            if (Feedback && Feedback.haptic) Feedback.haptic.medium();
        }
    },

    start: () => {
        console.log('[Timer] start() entered');
        if (isRunning && timerInterval) {
            console.log('[Timer] Already running, ignoring.');
            return;
        }
        
        if (!currentBeerStyleName) Timer.setRandomBeerBackground();

        const now = Date.now();
        const startTimestamp = now - accumulatedTime;
        
        localStorage.setItem(APP.STORAGE_KEYS.TIMER_START, startTimestamp);
        
        isRunning = true;
        Timer.updateUI(true);

        // ★追加: 再開時にいきなり音が鳴らないよう、現在の秒数で初期化
        lastTickSec = Math.floor(accumulatedTime / 1000);

        console.log('[Timer] Loop starting...');
        timerInterval = setInterval(() => {
            const currentNow = Date.now();
            const diff = currentNow - startTimestamp;
            accumulatedTime = diff; 

            const display = document.getElementById('timer-display');
            if(display) display.textContent = formatTime(diff);
            
            // ==================================================
            // ★追加: 秒針と鼓動のサウンドロジック (Tick & Beat)
            // ==================================================
            const currentSec = Math.floor(diff / 1000);
            
            // 秒数が切り替わった瞬間だけ実行
            if (currentSec > lastTickSec) {
                // 1分ごと (60, 120, 180...) -> 鼓動 (Heartbeat)
                if (currentSec > 0 && currentSec % 60 === 0) {
                    if (Feedback && Feedback.timerBeat) Feedback.timerBeat();
                } else {
                    // それ以外 -> 秒針 (Tick)
                    if (Feedback && Feedback.timerTick) Feedback.timerTick();
                }
                lastTickSec = currentSec; // 秒数を更新
            }
            // ==================================================

            Timer.updateCalculations(diff);

        }, 100); 
    },

    updateCalculations: (diffMs) => {
        const select = document.getElementById('timer-exercise-select');
        const exerciseKey = select ? select.value : 'other';
        const mets = EXERCISE[exerciseKey] ? EXERCISE[exerciseKey].mets : 3.0;

        const profile = Store.getProfile(); 
        const minutes = diffMs / 1000 / 60;
        
        // 運動消費カロリー (kcal)
        const burned = Calc.calculateExerciseBurn(mets, minutes, profile);
        
        const kcalEl = document.getElementById('timer-kcal');
        if(kcalEl) kcalEl.textContent = burned.toFixed(1);

        const beerEl = document.getElementById('timer-beer');
        if(beerEl) {
            const modes = Store.getModes(); 
            const refStyle = modes.mode1 || '国産ピルスナー'; 
            
            const kcalPer350 = CALORIES.STYLES[refStyle] || 140;
            const kcalPer1ml = kcalPer350 / 350;
            const ml = burned / kcalPer1ml;

            beerEl.textContent = Math.floor(ml);
        }

        Timer.updateRing(burned);

        if (isRunning) {
            if (burned - lastBurnedKcal > 0.1) { 
                Timer.createBubble(); 
                lastBurnedKcal = burned;
            }
            if (Math.random() < 0.3) {
                Timer.createBubble(true);
            }
        }
    },

    updateRing: (burnedKcal) => {
        const ring = document.getElementById('timer-ring');
        if (!ring) return;

        const modes = Store.getModes();
        const refStyle = modes.mode1 || '国産ピルスナー';
        const TARGET_KCAL = CALORIES.STYLES[refStyle] || 140;

        const progress = (burnedKcal % TARGET_KCAL) / TARGET_KCAL * 100;
        
        const ringColor = 'rgba(255, 255, 255, 0.9)'; 

        ring.style.background = `conic-gradient(
            ${ringColor} 0%, 
            ${ringColor} ${progress}%, 
            transparent ${progress}%, 
            transparent 100%
        )`;
    },

    createBubble: (isAmbient = false) => {
        const container = document.getElementById('timer-bubbles-container');
        if (!container) return;

        const b = document.createElement('div');
        b.className = 'absolute rounded-full backdrop-blur-sm pointer-events-none animate-float-up';
        
        b.style.backgroundColor = '#ffffff';
        b.style.opacity = isAmbient ? (Math.random() * 0.3 + 0.1).toString() : '0.6';
        
        const size = isAmbient 
            ? Math.random() * 8 + 3 
            : Math.random() * 20 + 8;
            
        b.style.width = `${size}px`;
        b.style.height = `${size}px`;
        b.style.left = `${Math.random() * 100}%`;
        b.style.bottom = '-20px'; 
        
        const duration = isAmbient ? (Math.random() * 4 + 5) : (Math.random() * 2 + 2);
        b.style.animationDuration = `${duration}s`;
        b.style.zIndex = "1";

        container.appendChild(b);

        setTimeout(() => {
            if(b.parentNode) b.parentNode.removeChild(b);
        }, duration * 1000);
    },

    pause: () => {
        console.log('[Timer] pause() called');
        if (!isRunning) return;

        localStorage.setItem(APP.STORAGE_KEYS.TIMER_ACCUMULATED, accumulatedTime);
        localStorage.removeItem(APP.STORAGE_KEYS.TIMER_START);

        isRunning = false;
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = null;
        
        Timer.updateUI(false);
    },

    finish: async () => {
        console.log('[Timer] finish() called');
        if (Feedback && Feedback.haptic) Feedback.haptic.success();
        Timer.pause();
        
        const totalMs = accumulatedTime;
        const minutes = Math.round(totalMs / 60000);

        if (minutes > 0) {
            const typeEl = document.getElementById('timer-exercise-select');
            const type = typeEl ? typeEl.value : 'other';
            
            toggleModal('timer-modal', false);

            setTimeout(() => {
                // main.js で window.UI が登録されている前提
                if (window.UI && window.UI.openManualInput) {
                    // 完了データを渡してモーダルを開く
                    const dummyLog = {
                        minutes: minutes,
                        exerciseKey: type,
                        memo: 'Timer Record',
                        timestamp: Date.now(),
                        applyBonus: true
                    };
                    
                    // 第2引数にログデータを渡してフォームにセットさせる
                    window.UI.openManualInput(null, dummyLog);
                    
                    // ★修正: データ渡し成功後にリセットを実行
                    Timer.reset();
                } else {
                    // ★追加: 万が一UIが見つからない場合の救済（リセットせずアラートを出す）
                    console.error('UI.openManualInput not found');
                    alert('エラー: 記録画面を開けませんでした。\n(データ保護のためリセットを中止しました。画面をリロードせず管理者へ報告してください)');
                }
            }, 300);
            
        } else {
            alert('1分未満のため記録しませんでした。');
            Timer.reset(); 
            toggleModal('timer-modal', false);
        }
    },

    reset: () => {
        console.log('[Timer] reset() called');
        Timer.pause();
        localStorage.removeItem(APP.STORAGE_KEYS.TIMER_START);
        localStorage.removeItem(APP.STORAGE_KEYS.TIMER_ACCUMULATED);
        
        accumulatedTime = 0;
        lastBurnedKcal = 0;
        currentBeerStyleName = null; 
        lastTickSec = 0; // ★追加: 秒数カウンターもリセット
        
        const container = document.getElementById('timer-bubbles-container');
        if (container) container.innerHTML = '';
        
        const display = document.getElementById('timer-display');
        const kcalEl = document.getElementById('timer-kcal');
        const beerEl = document.getElementById('timer-beer');
        const ring = document.getElementById('timer-ring');
        
        const modal = document.getElementById('timer-modal');
        if (modal) {
            modal.style.background = '';
            modal.classList.add('bg-base-900');
        }

        if (display) display.textContent = '00:00';
        if (kcalEl) kcalEl.textContent = '0.0';
        if (beerEl) beerEl.textContent = '0'; 
        if (ring) ring.style.background = 'transparent';
        
        Timer.updateUI(false);
        if (Feedback && Feedback.haptic) Feedback.haptic.light();
    },

    updateUI: (running) => {
        console.log('[Timer] updateUI called. running:', running);
        const toggleBtn = document.getElementById('btn-timer-toggle');
        const icon = document.getElementById('icon-timer-toggle');
        const finishBtn = document.getElementById('btn-timer-finish');
        const resetBtn = document.getElementById('btn-timer-reset');
        
        const select = document.getElementById('timer-exercise-select');
        const wrapper = select ? select.parentElement : null;

        if (running) {
            if(icon) icon.className = 'ph-fill ph-pause text-3xl';
            if(finishBtn) finishBtn.classList.add('hidden');
            if(resetBtn) resetBtn.classList.add('hidden');
            
            if(select) {
                select.disabled = true;
                select.classList.add('opacity-50', 'cursor-not-allowed');
                if(wrapper) wrapper.classList.add('opacity-50');
            }
        } else {
            if(icon) icon.className = 'ph-fill ph-play text-3xl ml-1';
            
            if (accumulatedTime > 0) {
                if(finishBtn) finishBtn.classList.remove('hidden');
                if(resetBtn) resetBtn.classList.remove('hidden');
            } else {
                if(finishBtn) finishBtn.classList.add('hidden');
                if(resetBtn) resetBtn.classList.add('hidden');
            }
            
            if(select) {
                select.disabled = false;
                select.classList.remove('opacity-50', 'cursor-not-allowed');
                if(wrapper) wrapper.classList.remove('opacity-50');
            }
        }
    }
};