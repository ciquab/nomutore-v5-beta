import { APP } from '../constants.js';
import confetti from 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.2/+esm';

// --- Sound & Haptics Engine ---

const AudioEngine = {
    ctx: null,
    noiseBuffer: null,

    init: () => {
        // すでに有効な Context があれば何もしない
        if (AudioEngine.ctx && AudioEngine.ctx.state !== 'closed') {
            return;
        }
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                AudioEngine.ctx = new AudioContext();
                AudioEngine.createNoiseBuffer();
            }
        } catch (e) {
            console.warn('AudioContext init failed:', e);
        }
    },

    resume: () => {
        if (AudioEngine.ctx && AudioEngine.ctx.state === 'suspended') {
            AudioEngine.ctx.resume().catch(() => {});
        }
    },

    createNoiseBuffer: () => {
        if (!AudioEngine.ctx) return;
        const bufferSize = AudioEngine.ctx.sampleRate * 2;
        const buffer = AudioEngine.ctx.createBuffer(1, bufferSize, AudioEngine.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        AudioEngine.noiseBuffer = buffer;
    },

    // 汎用トーン再生 (安全ガード付き・設定維持)
    playTone: (freq, type, duration, startTime = 0, vol = 0.1) => {
        if (!AudioEngine.ctx || AudioEngine.ctx.state === 'closed') AudioEngine.init();
        const ctx = AudioEngine.ctx;
        if (!ctx) return;
        if (ctx.state === 'suspended') ctx.resume();

        // --- 修正ポイント1: 数値の安全確保 (non-finite対策) ---
        const f = Number.isFinite(freq) ? freq : 440;
        const d = Number.isFinite(duration) ? duration : 0.1;
        const s = Number.isFinite(startTime) ? startTime : 0;
        const v = Number.isFinite(vol) ? vol : 0.1;

        try {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain(); // 修正ポイント2: try-catch内で作成

            osc.type = type || 'sine';
            osc.frequency.setValueAtTime(f, ctx.currentTime + s);

            gain.gain.setValueAtTime(v, ctx.currentTime + s);
            
            const endTime = ctx.currentTime + s + d;
            // 修正ポイント3: endTimeが有限であることを確認し、目標値を0.0001にする
            if (Number.isFinite(endTime)) {
                gain.gain.exponentialRampToValueAtTime(0.0001, endTime);
            }

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(ctx.currentTime + s);
            osc.stop(Number.isFinite(endTime) ? endTime : ctx.currentTime + s + 0.1);
        } catch (e) {
            console.warn('playTone error:', e);
        }
    },

    // ノイズ再生 (安全ガード付き・設定維持)
    playNoise: (duration, filterFreq = 1000, vol = 0.1, startTime = 0) => {
        if (!AudioEngine.ctx || !AudioEngine.noiseBuffer) AudioEngine.init();
        const ctx = AudioEngine.ctx;
        if (!ctx) return;
        if (ctx.state === 'suspended') ctx.resume();

        const d = Number.isFinite(duration) ? duration : 0.1;
        const s = Number.isFinite(startTime) ? startTime : 0;
        const f = Number.isFinite(filterFreq) ? filterFreq : 1000;
        const v = Number.isFinite(vol) ? vol : 0.1;

        try {
            const src = ctx.createBufferSource();
            src.buffer = AudioEngine.noiseBuffer;
            
            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = f;

            const gain = ctx.createGain();
            gain.gain.setValueAtTime(v, ctx.currentTime + s);

            const endTime = ctx.currentTime + s + d;
            if (Number.isFinite(endTime)) {
                gain.gain.exponentialRampToValueAtTime(0.0001, endTime);
            }

            src.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);

            src.start(ctx.currentTime + s);
            src.stop(Number.isFinite(endTime) ? endTime : ctx.currentTime + s + 0.1);
        } catch (e) {
            console.warn('playNoise error:', e);
        }
    },

    // ⚙️ 設定保存時の音（短いダブル・クリック）
    playSaveClick: () => {
        const t = AudioEngine.ctx.currentTime;
        // 1つ目の音：カチッ（高め）
        AudioEngine.playTone(800, 'sine', 0.05, 0, 0.08);
        // 2つ目の音：コッ（低め・0.05秒後）
        AudioEngine.playTone(400, 'sine', 0.03, 0.05, 0.1);
    },

    // 🔘 UIクリック音 (Clicky) - 設定維持
    playClick: () => {
        AudioEngine.playTone(800, 'sine', 0.05, 0, 0.05);
        AudioEngine.playNoise(0.03, 3000, 0.02);
    },

    // 🔢 ダイヤル音 (Tick) - 設定維持
    playTick: () => {
        AudioEngine.playTone(400, 'triangle', 0.03, 0, 0.05);
    },

    // ⏱ タイマー秒針 (Soft Tick) - 設定維持
    playSoftTick: () => {
        AudioEngine.playTone(1200, 'sine', 0.02, 0, 0.01);
    },

    // 🔔 完了/成功音 (Success Chord) - 設定維持
    playSuccess: () => {
        const t = 0;
        AudioEngine.playTone(523.25, 'sine', 0.4, t, 0.1);
        AudioEngine.playTone(659.25, 'sine', 0.4, t + 0.1, 0.1);
        AudioEngine.playTone(783.99, 'sine', 0.8, t + 0.2, 0.1);
    },

    // 🗑️ 削除音 (Delete) - 設定維持
    playDelete: () => {
        AudioEngine.playNoise(0.3, 500, 0.15); 
        AudioEngine.playTone(100, 'sawtooth', 0.2, 0, 0.05);
    },

    // 🍺 乾杯＆注ぐ音 (Beer Hybrid) - 設定維持
    playBeer: () => {
        if (!AudioEngine.ctx) AudioEngine.init();
        const ctx = AudioEngine.ctx;
        if (!ctx) return;
        const t = ctx.currentTime;

        const partials = [
            { f: 1400, d: 0.6, v: 0.15 }, { f: 3600, d: 0.2, v: 0.08 },
            { f: 6200, d: 0.08, v: 0.04 }, { f: 1650, d: 0.5, v: 0.12 },
            { f: 4100, d: 0.15, v: 0.06 }, { f: 8000, d: 0.04, v: 0.03 }
        ];

        partials.forEach(p => {
            try {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(p.f, t);
                gain.gain.setValueAtTime(0, t);
                gain.gain.linearRampToValueAtTime(p.v, t + 0.005);
                gain.gain.exponentialRampToValueAtTime(0.001, t + p.d);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(t);
                osc.stop(t + p.d);
            } catch(e) {}
        });

        AudioEngine.playNoise(1.5, 800, 0.1, 0.1); 
    }
};

// --- Haptics Engine --- (維持)
const HapticEngine = {
    isSupported: () => 'vibrate' in navigator,
    selection: () => { if (HapticEngine.isSupported()) navigator.vibrate(5); },
    light: () => { if (HapticEngine.isSupported()) navigator.vibrate(10); },
    medium: () => { if (HapticEngine.isSupported()) navigator.vibrate(20); },
    heavy: () => { if (HapticEngine.isSupported()) navigator.vibrate([40, 20, 40]); },
    heartbeat: () => { if (HapticEngine.isSupported()) navigator.vibrate(15); },
    success: () => { if (HapticEngine.isSupported()) navigator.vibrate([20, 50, 20]); }
};

// --- Feedback Interface (API) --- (設定維持)
export const Feedback = {
    audio: AudioEngine,
    haptic: HapticEngine, 
    initAudio: () => AudioEngine.init(),

    uiSwitch: () => {
        AudioEngine.init();
        AudioEngine.resume();
        AudioEngine.playTone(600, 'square', 0.05, 0, 0.1);
        if (Feedback.haptic) Feedback.haptic.selection();
    },

    uiDial: () => {
        AudioEngine.init();
        AudioEngine.resume();
        AudioEngine.playTone(1200, 'sine', 0.03, 0, 0.1);
        if (Feedback.haptic) Feedback.haptic.selection(); 
    },

    tap: () => {
        AudioEngine.init();
        AudioEngine.resume();
        AudioEngine.playTone(1800, 'sine', 0.02, 0, 0.05);
        if (Feedback.haptic) Feedback.haptic.light();
    },

    beer: () => { AudioEngine.playBeer(); HapticEngine.medium(); },
    delete: () => { AudioEngine.playDelete(); HapticEngine.heavy(); },
    success: () => { AudioEngine.playSuccess(); HapticEngine.success(); },
    error: () => { AudioEngine.playTone(150, 'sawtooth', 0.3); HapticEngine.heavy(); },
    timerTick: () => { AudioEngine.playSoftTick(); },
    timerBeat: () => { AudioEngine.playTone(200, 'sine', 0.1); HapticEngine.heartbeat(); },
    save: () => {
        AudioEngine.playSaveClick();
        if (Feedback.haptic) Feedback.haptic.light(); // 軽い振動もセット
    }
};

// --- Toast Animation Helper (New) ---
export const showToastAnimation = () => {
    // 既存のアニメーションがあれば削除
    const existing = document.getElementById('toast-animation-layer');
    if (existing) existing.remove();

    // オーバーレイ作成
    const overlay = document.createElement('div');
    overlay.id = 'toast-animation-layer';
    overlay.className = "fixed inset-0 pointer-events-none flex items-center justify-center z-[10001] overflow-hidden";
    
    // 左右のグラスとテキスト
    overlay.innerHTML = `
        <div class="text-[8rem] animate-clink-left absolute translate-x-[-100vw]">🍺</div>
        <div class="text-[8rem] animate-clink-right absolute translate-x-[100vw] scale-x-[-1]">🍺</div>
        <div class="absolute text-4xl font-black text-white drop-shadow-lg animate-toast-text opacity-0" style="animation-delay: 0.5s">Cheers!</div>
    `;

    document.body.appendChild(overlay);

    // アニメーション終了後に削除 (1.5s後)
    setTimeout(() => {
        if (overlay) overlay.remove();
    }, 1500);
};

// --- DOM Logic ---

const shareContent = async (text) => {
    if (navigator.share) {
        try {
            await navigator.share({
                title: 'Nomutore Log',
                text: text,
            });
        } catch (err) {
            console.log('Share canceled or failed', err);
        }
    } else {
        navigator.clipboard.writeText(text).then(() => {
            alert('クリップボードにコピーしました！SNSに貼り付けてください。');
        });
    }
};

export const DOM = {
    isInitialized: false,
    elements: {},
    
    /**
     * View Transitions APIの安全なラッパー
     * 非対応ブラウザでは即時実行し、対応ブラウザではアニメーションさせる
     */
    withTransition: (callback) => {
        // ユーザーが「視差効果を減らす」設定にしている場合はアニメーションしない
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        if (!document.startViewTransition || prefersReducedMotion) {
            callback();
            return;
        }
        document.startViewTransition(callback);
    },

    /**
     * アイコン定義（クラス名または絵文字）を受け取り、HTML文字列を返す
     * @param {string} iconDef - "ph-beer-bottle" or "🍺"
     * @param {string} extraClasses - 追加のTailwindクラス
     */
    renderIcon: (iconDef, extraClasses = "") => {
        if (!iconDef) return "";
        
        // Phosphor Icon (ph-) かどうか判定
        if (iconDef.includes('ph-')) {
            return `<i class="${iconDef} ${extraClasses}"></i>`;
        } else {
            // 絵文字の場合はそのままspanで囲む（後方互換性）
            return `<span class="${extraClasses} font-emoji">${iconDef}</span>`;
        }
    },

    init: () => {
        if (DOM.isInitialized) return;
        
        const ids = [
            'message-box', 'drinking-section', 
            'beer-date', 'beer-select', 'beer-size', 'beer-count',
            'beer-input-preset', 'beer-input-custom',
            'custom-abv', 'custom-amount', 
            'tab-beer-preset', 'tab-beer-custom',
            'check-date', 'check-weight', 
            'manual-exercise-name', 'manual-date', 
            'weight-input', 'height-input', 'age-input', 'gender-input',
            'setting-mode-1', 'setting-mode-2', 'setting-base-exercise', 'theme-input','setting-default-record-exercise',
            'home-mode-select', 
            
            'tank-liquid', 'tank-liquid-back',
            'tank-empty-icon', 'tank-cans', 'tank-minutes', 'tank-message',

            'log-list', 'history-base-label',

            'liver-rank-card', 'rank-title', 'dry-count', 'rank-progress', 'rank-next-msg',
            'check-status', 
            
            'streak-count', 'streak-badge',
            'heatmap-grid', 'heatmap-period-label', 'heatmap-prev', 'heatmap-next',
            'balanceChart', 'chart-filters',

            'beer-modal', 'check-modal', 'exercise-modal', 'settings-modal', 'help-modal',
            'global-error-overlay', 'error-details', 'swipe-coach-mark',
            'check-library-modal',
            'action-menu-modal'
        ];

        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) DOM.elements[id] = el;
            if (id === 'tank-liquid' && !el) {
                DOM.elements['tank-liquid'] = document.getElementById('orb-liquid-front');
            }
        });

        const enableAudio = () => {
            Feedback.initAudio();
            document.removeEventListener('click', enableAudio);
            document.removeEventListener('touchstart', enableAudio);
        };
        document.addEventListener('click', enableAudio, { once: true });
        document.addEventListener('touchstart', enableAudio, { once: true });

        DOM.isInitialized = true;
    }
};

export const escapeHtml = (str) => {
    if(typeof str !== 'string') return str;
    return str.replace(/[&<>"']/g, function(m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
};

export const toggleModal = (modalId, show = true) => {
    const el = DOM.elements[modalId] || document.getElementById(modalId);
    if (!el) return;
    
    if (show) Feedback.uiSwitch();

    if (show) {
        el.classList.remove('hidden');
        el.classList.add('flex');
        setTimeout(() => {
            el.querySelector('div[class*="transform"]')?.classList.remove('scale-95', 'opacity-0');
            el.querySelector('div[class*="transform"]')?.classList.add('scale-100', 'opacity-100');
        }, 10);
    } else {
        el.querySelector('div[class*="transform"]')?.classList.remove('scale-100', 'opacity-100');
        el.querySelector('div[class*="transform"]')?.classList.add('scale-95', 'opacity-0');
        setTimeout(() => {
            el.classList.add('hidden');
            el.classList.remove('flex');
        }, 200);
    }
};

export const showConfetti = () => {
    confetti({
        particleCount: 100, spread: 70, origin: { y: 0.6 },
        colors: ['#FBBF24', '#F59E0B', '#FFFFFF']
    });
};

export const showMessage = (text, type = 'info', action = null) => {
    const box = DOM.elements['message-box'] || document.getElementById('message-box');
    if (!box) return;

    const baseClass = "fixed top-6 left-1/2 transform -translate-x-1/2 pl-6 pr-2 py-2 rounded-full shadow-lg z-[9999] transition-all duration-300 text-sm font-bold flex items-center gap-3";
    let colorClass = 'bg-indigo-600 text-white';
    if (type === 'error') colorClass = 'bg-red-500 text-white';
    if (type === 'success') colorClass = 'bg-emerald-500 text-white';

    box.className = `${baseClass} ${colorClass}`;
    
    let content = `<span>${text}</span>`;
    
    if (action && action.type === 'share') {
        const btnId = `msg-btn-share-${Date.now()}`;
        // アイコンをカメラに変更しても良いが、汎用的にShareアイコンのままにする
        content += `
            <button id="${btnId}" class="bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-full text-xs transition flex items-center gap-1">
                <i class="ph-bold ph-share-network"></i> Share
            </button>
        `;
        setTimeout(() => {
            const btn = document.getElementById(btnId);
            if(btn) {
                btn.onclick = () => {
                    // ★追加: 画像シェアモードのハンドリング
                    if (action.shareMode === 'image' && window.UI && window.UI.share) {
                        if (Feedback.haptic) Feedback.haptic.light();
                        // Shareエンジンを起動 ('beer', logData)
                        window.UI.share(action.imageType, action.imageData);
                    } else {
                        // 既存のテキストシェア
                        if (Feedback.haptic) Feedback.haptic.light();
                        const shareText = action.text || text;
                        shareContent(shareText);
                    }
                };
            }
        }, 0);
    } else {
        box.className = box.className.replace('pr-2', 'pr-6');
    }

    box.innerHTML = content;
    
    box.classList.remove('translate-y-[-150%]', 'opacity-0');
    setTimeout(() => {
        box.classList.add('translate-y-[-150%]', 'opacity-0');
    }, action ? 5000 : 3000);
};

export const toggleDryDay = (isDry) => {

    // ★追加: スイッチ切り替えの感触
    // 既存のFeedbackオブジェクトが定義された後であれば Feedback.haptic.medium() が呼べます
    // もし関数の定義位置が Feedback より前にある場合は、直接 HapticEngine.medium() を呼んでも構いません
    if (typeof Feedback !== 'undefined' && Feedback.haptic) {
        Feedback.haptic.medium();
    } else if (typeof HapticEngine !== 'undefined') {
        HapticEngine.medium();
    }

    const section = document.getElementById('drinking-section');
    if (!section) return;

    const label = section.querySelector('span');
    const hint = section.querySelector('p');

    section.classList.remove('bg-orange-50', 'border-orange-100', 'bg-emerald-50', 'border-emerald-100');
    if (label) label.classList.remove('text-orange-800', 'text-emerald-800');
    if (hint) hint.classList.remove('text-orange-600/70', 'text-emerald-600/70');

    if (isDry) {
        section.classList.add('bg-emerald-50', 'border-emerald-100');
        if (label) label.classList.add('text-emerald-800');
        if (hint) {
            hint.classList.add('text-emerald-600/70');
            hint.textContent = "素晴らしい！肝臓が回復しています✨";
        }
    } else {
        section.classList.add('bg-orange-50', 'border-orange-100');
        if (label) label.classList.add('text-orange-800');
        if (hint) {
            hint.classList.add('text-orange-600/70');
            hint.textContent = "一滴も飲まなかった日はスイッチON";
        }
    }
};

export const applyTheme = (themeName) => {
    const root = document.documentElement;
    let isDark = themeName === 'dark';

    if (themeName === 'system') {
        isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    if (isDark) {
        root.classList.add('dark');
        root.classList.remove('light');
    } else {
        root.classList.remove('dark');
        root.classList.add('light');
    }

    const icon = document.getElementById('theme-icon');
    if (icon) {
        if (isDark) {
            icon.className = 'ph-fill ph-moon-stars text-lg text-yellow-400 transition-colors';
        } else {
            icon.className = 'ph-fill ph-sun text-lg text-orange-500 transition-colors';
        }
    }

};

// ★追加: 監視と初期化を行う関数
export const initTheme = () => {
    // 1. システム(OS)側のダークモード切り替えを監視する
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        const currentSetting = localStorage.getItem(APP.STORAGE_KEYS.THEME);
        
        // 設定が「system」または「未設定」の時だけ、再適用する
        if (!currentSetting || currentSetting === 'system') {
            applyTheme('system'); // 再評価させる
        }
    });

    // 2. アプリ起動時の適用
    const stored = localStorage.getItem(APP.STORAGE_KEYS.THEME);
    applyTheme(stored || 'system');
};


