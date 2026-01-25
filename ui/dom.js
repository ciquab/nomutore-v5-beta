import { APP } from '../constants.js';
import confetti from 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.2/+esm';

// --- Sound & Haptics Engine ---

const AudioEngine = {
    ctx: null,
    
    init: () => {
        if (!AudioEngine.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                AudioEngine.ctx = new AudioContext();
            }
        }
    },

    resume: () => {
        if (AudioEngine.ctx && AudioEngine.ctx.state === 'suspended') {
            AudioEngine.ctx.resume().catch(() => {});
        }
    },

    playTone: (freq, type, duration, startTime = 0, vol = 0.1) => {
        if (!AudioEngine.ctx) AudioEngine.init();
        const ctx = AudioEngine.ctx;
        if (!ctx) return;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime + startTime);

        gain.gain.setValueAtTime(vol, ctx.currentTime + startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startTime + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + startTime);
        osc.stop(ctx.currentTime + startTime + duration);
    },

    // 🍺 乾杯音 (Clink)
    // ★修正: リアルなグラス音の合成ロジック
    // 複数の正弦波（Sine wave）を重ねて、ガラス特有の不協和音と共鳴を再現します
    playBeer: () => {
        if (!AudioEngine.ctx) AudioEngine.init();
        const ctx = AudioEngine.ctx;
        if (!ctx) return;
        const t = ctx.currentTime;

        // グラスの響きを構成する成分（周波数Hz, 持続秒数, 音量）
        // 余韻(d)を全体的に短縮しました (例: 1.2s -> 0.6s)
        const partials = [
            // Glass 1 (Main)
            { f: 1400, d: 0.6, v: 0.15 }, // 基音 (Fundamental)
            { f: 3600, d: 0.2, v: 0.08 }, // 倍音1 (Attack)
            { f: 6200, d: 0.08, v: 0.04 }, // 倍音2 (Click)

            // Glass 2 (Harmony/Dissonance)
            { f: 1650, d: 0.5, v: 0.12 }, // 基音 (2nd glass)
            { f: 4100, d: 0.15, v: 0.06 }, // 倍音1
            
            // Impact Transient (衝突瞬間の高音ノイズ成分)
            { f: 8000, d: 0.04, v: 0.03 } 
        ];

        partials.forEach(p => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            
            osc.type = 'sine'; // ガラス音は正弦波が最適
            osc.frequency.setValueAtTime(p.f, t);
            
            // エンベロープ（音量変化）の設定
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(p.v, t + 0.005); // 5msで急激に立ち上がり（打撃感）
            gain.gain.exponentialRampToValueAtTime(0.001, t + p.d); // 余韻を残して減衰
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            osc.start(t);
            osc.stop(t + p.d);
        });
    },

    // 🏃‍♀️ 達成音
    playSuccess: () => {
        AudioEngine.playTone(880, 'sine', 0.15, 0, 0.1);
        AudioEngine.playTone(1109, 'sine', 0.15, 0.1, 0.1);
        AudioEngine.playTone(1318, 'sine', 0.4, 0.2, 0.1);
    },

    // ✅ チェック音
    playPop: () => {
        AudioEngine.playTone(600, 'sine', 0.1, 0, 0.1);
    },
    
    // 🗑️ 削除音
    playDelete: () => {
        AudioEngine.playTone(150, 'sawtooth', 0.2, 0, 0.1);
    },

    // ⚠️ エラー音
    playError: () => {
        AudioEngine.playTone(150, 'sawtooth', 0.3, 0, 0.1);
        AudioEngine.playTone(100, 'sawtooth', 0.3, 0.1, 0.1);
    }
};

export const HapticEngine = {
    // 端末が振動APIに対応しているかチェック
    isSupported: () => 'vibrate' in navigator,

    // 1. Selection (カチッ): 軽量。UI操作、ボタンタップ
    light: () => {
        if (HapticEngine.isSupported()) navigator.vibrate(10); 
    },

    // 2. Impact (ドゥン): 中量。決定、トグル切り替え
    medium: () => {
        if (HapticEngine.isSupported()) navigator.vibrate(25);
    },

    // 3. Heavy/Notification (ブブッ): 重量。エラー、完了、警告
    heavy: () => {
        if (HapticEngine.isSupported()) navigator.vibrate([50, 30, 50]);
    },

    // 4. Success (タタンッ): 完了成功
    success: () => {
        if (HapticEngine.isSupported()) navigator.vibrate([30, 50, 30]);
    }
};

// ★修正: Feedbackオブジェクトに haptic を追加してexport

export const Feedback = {
    audio: AudioEngine,
    haptic: HapticEngine, 

    initAudio: () => AudioEngine.init(),

    // タップ音（チェックボックスなど）
    tap: () => {
        // ★修正: playPop（軽い音）を使う
        if (AudioEngine.playPop) AudioEngine.playPop();
        else AudioEngine.playTone(600, 'sine', 0.05); 
        
        if (HapticEngine.isSupported()) navigator.vibrate(10);
    },

    // ビール保存（さきほど直した部分）
    beer: () => { 
        if (AudioEngine.playBeer) AudioEngine.playBeer();
        else AudioEngine.playTone(2000, 'sine', 0.4);
        HapticEngine.medium(); 
    },

    // 運動保存（成功音）
    success: () => { 
        // ★修正: playSuccess（3連音）を使う
        if (AudioEngine.playSuccess) AudioEngine.playSuccess();
        else AudioEngine.playTone(880, 'sine', 0.1);
        
        HapticEngine.success(); 
    },

    // 削除アクション
    delete: () => {
        // ★修正: playDelete（低い音）を使う
        if (AudioEngine.playDelete) AudioEngine.playDelete();
        HapticEngine.heavy();
    },

    // エラー
    error: () => {
        if (AudioEngine.playError) AudioEngine.playError();
        HapticEngine.notification();
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

// --- Existing DOM Logic ---

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
    
    if (show && Feedback.haptic) Feedback.haptic.light();

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
        const shareText = action.text || text;
        const btnId = `msg-btn-share-${Date.now()}`;
        content += `
            <button id="${btnId}" class="bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-full text-xs transition flex items-center gap-1">
                <i class="ph-bold ph-share-network"></i> Share
            </button>
        `;
        setTimeout(() => {
            const btn = document.getElementById(btnId);
            if(btn) {
                btn.onclick = () => {
                    // シェアボタンのクリック感を追加
                    if (Feedback.haptic) Feedback.haptic.light();
                    shareContent(shareText);
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
            hint.textContent = "Great! Keeping your liver healthy. ✨";
        }
    } else {
        section.classList.add('bg-orange-50', 'border-orange-100');
        if (label) label.classList.add('text-orange-800');
        if (hint) {
            hint.classList.add('text-orange-600/70');
            hint.textContent = "Switch ON if you didn't drink alcohol.";
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


