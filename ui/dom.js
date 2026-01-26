import { APP } from '../constants.js';
import confetti from 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.2/+esm';

// --- Sound & Haptics Engine ---

const AudioEngine = {
    ctx: null,
    noiseBuffer: null,

    init: () => {
        if (!AudioEngine.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                AudioEngine.ctx = new AudioContext();
                AudioEngine.createNoiseBuffer();
            }
        }
    },

    resume: () => {
        if (AudioEngine.ctx && AudioEngine.ctx.state === 'suspended') {
            AudioEngine.ctx.resume().catch(() => {});
        }
    },

    // ノイズバッファ生成（液体音・紙音用）
    createNoiseBuffer: () => {
        if (!AudioEngine.ctx) return;
        const bufferSize = AudioEngine.ctx.sampleRate * 2; // 2 seconds
        const buffer = AudioEngine.ctx.createBuffer(1, bufferSize, AudioEngine.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        AudioEngine.noiseBuffer = buffer;
    },

    // 汎用トーン再生
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

    // ノイズ再生
    playNoise: (duration, filterFreq = 1000, vol = 0.1, startTime = 0) => {
        if (!AudioEngine.ctx || !AudioEngine.noiseBuffer) AudioEngine.init();
        const ctx = AudioEngine.ctx;
        if (!ctx) return;

        const src = ctx.createBufferSource();
        src.buffer = AudioEngine.noiseBuffer;
        
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = filterFreq;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(vol, ctx.currentTime + startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startTime + duration);

        src.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        src.start(ctx.currentTime + startTime);
        src.stop(ctx.currentTime + startTime + duration);
    },

    // 🔘 UIクリック音 (Clicky)
    playClick: () => {
        AudioEngine.playTone(800, 'sine', 0.05, 0, 0.05);
        AudioEngine.playNoise(0.03, 3000, 0.02);
    },

    // 🔢 ダイヤル音 (Tick)
    playTick: () => {
        AudioEngine.playTone(400, 'triangle', 0.03, 0, 0.05);
    },

    // ⏱ タイマー秒針 (Soft Tick)
    playSoftTick: () => {
        AudioEngine.playTone(1200, 'sine', 0.02, 0, 0.01);
    },

    // 🔔 完了/成功音 (Success Chord)
    playSuccess: () => {
        const t = 0;
        AudioEngine.playTone(523.25, 'sine', 0.4, t, 0.1);
        AudioEngine.playTone(659.25, 'sine', 0.4, t + 0.1, 0.1);
        AudioEngine.playTone(783.99, 'sine', 0.8, t + 0.2, 0.1);
    },

    // 🗑️ 削除音 (Delete)
    playDelete: () => {
        AudioEngine.playNoise(0.3, 500, 0.15); 
        AudioEngine.playTone(100, 'sawtooth', 0.2, 0, 0.05);
    },

    // 🍺 乾杯＆注ぐ音 (Beer Hybrid)
    // ★修正: あなたの素晴らしいグラス音コード + 炭酸ノイズ
    playBeer: () => {
        if (!AudioEngine.ctx) AudioEngine.init();
        const ctx = AudioEngine.ctx;
        if (!ctx) return;
        const t = ctx.currentTime;

        // 1. リアルなグラス音 (ご提示のコード)
        const partials = [
            { f: 1400, d: 0.6, v: 0.15 }, // 基音
            { f: 3600, d: 0.2, v: 0.08 }, // 倍音1
            { f: 6200, d: 0.08, v: 0.04 }, // 倍音2
            { f: 1650, d: 0.5, v: 0.12 }, // 基音2 (不協和音)
            { f: 4100, d: 0.15, v: 0.06 }, // 倍音1
            { f: 8000, d: 0.04, v: 0.03 }  // 衝突音
        ];

        partials.forEach(p => {
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
        });

        // 2. 液体/炭酸の音 (追加演出)
        // グラスが鳴った0.1秒後から「シュワァ...」と注ぐ音を入れる
        // duration: 1.5s, filter: 800Hz (こもった音), vol: 0.1, delay: 0.1s
        AudioEngine.playNoise(1.5, 800, 0.1, 0.1); 
    }
};

// --- Haptics Engine ---
const HapticEngine = {
    isSupported: () => 'vibrate' in navigator,

    // 極軽量 (UI操作)
    selection: () => { if (HapticEngine.isSupported()) navigator.vibrate(5); }, // カチッ
    
    // 軽量 (ボタン)
    light: () => { if (HapticEngine.isSupported()) navigator.vibrate(10); }, // コトッ
    
    // 中量 (決定)
    medium: () => { if (HapticEngine.isSupported()) navigator.vibrate(20); }, // ドゥン
    
    // 重量 (エラー/警告)
    heavy: () => { if (HapticEngine.isSupported()) navigator.vibrate([40, 20, 40]); }, // ブブッ

    // 鼓動 (タイマー)
    heartbeat: () => { if (HapticEngine.isSupported()) navigator.vibrate(15); }, // ドクン

    // 成功 (完了)
    success: () => { if (HapticEngine.isSupported()) navigator.vibrate([20, 50, 20]); } // タタン
};

// --- Feedback Interface (API) ---
export const Feedback = {
    audio: AudioEngine,
    haptic: HapticEngine, 
    initAudio: () => AudioEngine.init(),

    // --- 1. UI Micro-interactions (日常操作) ---

    // タブ切り替え / モーダル開閉 / スイッチ
    // 軽い「カチッ」 + 極短振動
    uiSwitch: () => {
        AudioEngine.playClick(); // playPopの代わり
        HapticEngine.selection();
    },

    // 数値カウンター (+/-) 
    // 木片のような「コリッ」 + 極短振動
    uiDial: () => {
        AudioEngine.playTick(); 
        HapticEngine.selection();
    },

    // 一般的なボタンタップ
    // 少し柔らかいクリック感
    tap: () => {
        AudioEngine.playClick();
        HapticEngine.light();
    },

    // --- 2. Action Feedback (意味のある操作) ---

    // ビール保存 / 乾杯
    // グラス音 + 炭酸音 + 重めの振動
    beer: () => { 
        AudioEngine.playBeer();
        HapticEngine.medium(); 
    },

    // 削除アクション
    // 紙を丸める音 + 警告振動
    delete: () => {
        AudioEngine.playDelete();
        HapticEngine.heavy();
    },

    // 完了 / 成功 / 完済
    // 3和音のチャイム + 祝祭振動
    success: () => { 
        AudioEngine.playSuccess();
        HapticEngine.success(); 
    },

    // エラー / バリデーション
    // 不協和音 + 警告振動
    error: () => {
        // AudioEngineにplayErrorがない場合はToneで代用
        AudioEngine.playTone(150, 'sawtooth', 0.3);
        HapticEngine.heavy();
    },

    // --- 3. Immersive Feedback (没入演出) ---

    // タイマーの秒針 (毎秒)
    // 非常に静かな音のみ (振動なし)
    timerTick: () => {
        AudioEngine.playSoftTick();
    },

    // タイマーの鼓動 (1分毎)
    // 重低音 + 心拍振動
    timerBeat: () => {
        AudioEngine.playTone(200, 'sine', 0.1);
        HapticEngine.heartbeat();
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


