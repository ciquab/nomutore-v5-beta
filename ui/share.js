import { toPng } from 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/+esm';
import { APP, STYLE_METADATA } from '../constants.js';
import { Store } from '../store.js';
import { Calc } from '../logic.js';
import { DOM, showMessage, Feedback, escapeHtml, toggleModal } from './dom.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

/* =========================================
   Share Engine (Photo Composer)
   ========================================= */

// 画像編集用の状態管理
let editState = {
    scale: 1.0,
    x: 0,
    y: 0,
    isDragging: false,
    startX: 0,
    startY: 0,
    aspectRatio: '1 / 1'
};

export const Share = {
    generateAndShare: async (mode = 'status', data = null) => {
        if (mode === 'beer') {
            startBeerPhotoFlow(data);
        } else {
            generateGraphicCard(mode, data);
        }
    }
};

/* --- 1. Photo Flow (Beer) --- */

const startBeerPhotoFlow = (logData) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (readerEvent) => {
                // 状態リセット
                editState = { scale: 1.0, x: 0, y: 0, isDragging: false, startX: 0, startY: 0, aspectRatio: '1 / 1' };
                openPhotoComposer(readerEvent.target.result, logData);
            };
            reader.readAsDataURL(file);
        } else {
            if(confirm('写真なしでシェア用カードを作成しますか？')) {
                generateGraphicCard('beer', logData);
            }
        }
        input.remove();
    };
    input.click();
};

const openPhotoComposer = (imgSrc, log) => {
    const existing = document.getElementById('share-composer-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'share-composer-modal';
    modal.className = "fixed inset-0 z-[9999] bg-base-950 flex flex-col animate-fade-in";

    const brand = log.brand || log.name;
    const brewery = log.brewery || '';
    const kcal = Math.abs(Math.round(log.kcal));
    const date = dayjs(log.timestamp).format('YYYY.MM.DD');

    // ★変更: 透過ロゴを使用 (logo-header.png)
    const logoSrc = "./logo-header.png";

    // ★追加: アスペクト比の定義
    const ratios = [
        { label: '1:1', value: '1 / 1', icon: 'ph-square' },
        { label: '3:4', value: '3 / 4', icon: 'ph-rectangle', class: 'rotate-0' },
        { label: '9:16', value: '9 / 16', icon: 'ph-device-mobile' },
        { label: '4:3', value: '4 / 3', icon: 'ph-rectangle', class: 'rotate-90' },
        { label: '16:9', value: '16 / 9', icon: 'ph-monitor' }
    ];

    // ★追加: ボタンHTML生成
    const ratioButtonsHtml = ratios.map(r => `
        <button class="ratio-btn flex flex-col items-center gap-1 p-2 rounded-lg transition shrink-0 ${editState.aspectRatio === r.value ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}" 
                data-value="${r.value}">
            <i class="ph-bold ${r.icon} text-lg ${r.class || ''}"></i>
            <span class="text-[9px] font-bold">${r.label}</span>
        </button>
    `).join('');

    modal.innerHTML = `
        <div class="px-4 py-3 flex justify-between items-center bg-black/60 backdrop-blur-md text-white z-20 absolute top-0 w-full border-b border-white/10">
            <button id="btn-cancel-composer" class="text-xs font-bold text-gray-300 hover:text-white py-2">Cancel</button>
            <h3 class="font-black text-xs tracking-widest">EDIT PHOTO</h3>
            <button id="btn-generate-share" class="text-xs font-bold text-indigo-400 hover:text-indigo-300 py-2">Next</button>
        </div>

        <div id="composer-touch-area" class="flex-1 min-h-0 flex items-center justify-center bg-black overflow-hidden relative cursor-move touch-none p-4">
            
            <div id="composer-canvas" class="relative bg-gray-900 shadow-2xl overflow-hidden pointer-events-none transition-all duration-300 ease-out w-full h-auto max-w-md max-h-full" 
                 style="aspect-ratio: ${editState.aspectRatio};">
                
                <img id="composer-img" src="${imgSrc}" class="absolute inset-0 w-full h-full object-cover origin-center transition-transform duration-75 ease-linear will-change-transform">

                <div class="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 via-black/40 to-transparent z-10 pt-24">
                    <div class="flex items-end justify-between">
                        <div class="flex items-center gap-3">
                            <div class="w-12 h-12 bg-white/10 backdrop-blur-md rounded-xl border border-white/20 flex items-center justify-center shadow-lg overflow-hidden p-1">
                                <img src="${logoSrc}" class="w-full h-full object-contain opacity-90 drop-shadow-sm" crossorigin="anonymous">
                            </div>
                            <div class="flex flex-col text-white drop-shadow-md">
                                <span class="text-[10px] font-bold text-gray-300 uppercase tracking-wider leading-none mb-1">Logged with NOMUTORE</span>
                                <span class="text-xl font-black leading-none line-clamp-1 filter drop-shadow-lg">${escapeHtml(brand)}</span>
                                ${brewery ? `<span class="text-xs font-bold text-gray-300 line-clamp-1 mt-0.5">${escapeHtml(brewery)}</span>` : ''}
                            </div>
                        </div>
                        <div id="composer-stats" class="text-right text-white drop-shadow-md transition-opacity duration-300">
                            <div class="flex flex-col items-end">
                                <span class="text-3xl font-black font-mono leading-none filter drop-shadow-lg">-${kcal}</span>
                                <span class="text-[9px] font-bold uppercase text-red-400 tracking-wider">Debt Created</span>
                            </div>
                        </div>
                    </div>
                    <div class="absolute top-5 right-5 text-[10px] font-mono font-bold text-white/60 tracking-widest border border-white/20 px-2 py-0.5 rounded-full backdrop-blur-sm">
                        ${date}
                    </div>
                </div>
            </div>
            
            <div id="grid-overlay" class="absolute pointer-events-none opacity-20 flex items-center justify-center border border-white/50 border-dashed transition-all duration-300 ease-out w-full h-auto max-w-md max-h-full"
                 style="aspect-ratio: ${editState.aspectRatio};">
            </div>
        </div>

        <div class="bg-base-900 border-t border-gray-800 z-20 flex flex-col pb-safe">
            
            <div class="flex gap-2 px-4 py-2 overflow-x-auto border-b border-gray-800 scrollbar-hide justify-center">
                ${ratioButtonsHtml}
            </div>

            <div class="px-4 py-3 flex flex-col gap-3">
                
                <div class="flex items-center gap-3">
                    <i class="ph-bold ph-minus text-gray-500 text-xs"></i>
                    <input type="range" id="zoom-slider" min="0.5" max="3.0" step="0.01" value="1.0" class="flex-1 accent-indigo-500 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer">
                    <i class="ph-bold ph-plus text-gray-500 text-xs"></i>
                </div>

                <div class="flex items-center justify-between">
                    <label class="flex items-center gap-2 cursor-pointer bg-gray-800/50 px-3 py-1.5 rounded-lg active:bg-gray-800 transition">
                        <div class="relative inline-flex items-center">
                            <input type="checkbox" id="toggle-kcal" class="sr-only peer" checked>
                            <div class="w-7 h-4 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-500"></div>
                        </div>
                        <span class="text-[10px] font-bold text-gray-400">Show Calories</span>
                    </label>
                    
                    <span class="text-[9px] text-gray-600 font-bold flex items-center gap-1">
                        <i class="ph-bold ph-hand-pointing"></i> Drag & Pinch
                    </span>
                </div>
            </div>
            <div class="h-4 bg-base-900"></div>
        </div>
    `;

    document.body.appendChild(modal);

    // --- Logic ---
    const canvas = document.getElementById('composer-canvas');
    const grid = document.getElementById('grid-overlay');

    // ★追加: アスペクト比切り替えロジック
    const ratioBtns = modal.querySelectorAll('.ratio-btn');
    ratioBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // 状態更新
            editState.aspectRatio = btn.dataset.value;

            // ★追加: リセット処理 (画像サイズと位置を初期化して吸着させる)
            editState.scale = 1.0;
            editState.x = 0;
            editState.y = 0;
            updateTransform(); // 画像のstyleを更新
            
            // UI更新
            canvas.style.aspectRatio = editState.aspectRatio;
            grid.style.aspectRatio = editState.aspectRatio;

            // ボタンの見た目更新
            ratioBtns.forEach(b => {
                if (b === btn) {
                    b.classList.remove('bg-gray-800', 'text-gray-400');
                    b.classList.add('bg-indigo-600', 'text-white');
                } else {
                    b.classList.add('bg-gray-800', 'text-gray-400');
                    b.classList.remove('bg-indigo-600', 'text-white');
                }
            });
            Feedback.tap();
        });
    });

    // --- Interaction Logic (Pan & Zoom) ---
    const touchArea = document.getElementById('composer-touch-area');
    const imgEl = document.getElementById('composer-img');
    const zoomSlider = document.getElementById('zoom-slider');

    const updateTransform = () => {
        imgEl.style.transform = `translate(${editState.x}px, ${editState.y}px) scale(${editState.scale})`;
        zoomSlider.value = editState.scale;
    };

    // Slider Zoom
    zoomSlider.oninput = (e) => {
        editState.scale = parseFloat(e.target.value);
        updateTransform();
    };

    // Mouse/Touch Events for Dragging
    const handleStart = (clientX, clientY) => {
        editState.isDragging = true;
        editState.startX = clientX - editState.x;
        editState.startY = clientY - editState.y;
    };

    const handleMove = (clientX, clientY) => {
        if (!editState.isDragging) return;
        editState.x = clientX - editState.startX;
        editState.y = clientY - editState.startY;
        updateTransform();
    };

    const handleEnd = () => {
        editState.isDragging = false;
    };

    // Mouse
    touchArea.addEventListener('mousedown', (e) => handleStart(e.clientX, e.clientY));
    window.addEventListener('mousemove', (e) => handleMove(e.clientX, e.clientY));
    window.addEventListener('mouseup', handleEnd);

    // Touch
    touchArea.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            handleStart(e.touches[0].clientX, e.touches[0].clientY);
        }
    }, { passive: false });

    touchArea.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1) {
            e.preventDefault(); // Prevent scrolling
            handleMove(e.touches[0].clientX, e.touches[0].clientY);
        }
    }, { passive: false });

    touchArea.addEventListener('touchend', handleEnd);


    // Buttons
    document.getElementById('btn-cancel-composer').onclick = () => modal.remove();

    const toggleKcal = document.getElementById('toggle-kcal');
    const statsEl = document.getElementById('composer-stats');
    toggleKcal.onchange = (e) => {
        statsEl.classList.toggle('opacity-0', !e.target.checked);
        Feedback.tap();
    };

    // ★重要: エラー回避のため、ここでは「生成」だけを行い、完了後に「シェアボタン」を表示する
    document.getElementById('btn-generate-share').onclick = async () => {
        const loadingId = showLoadingOverlay('画像を生成中...');
        const btn = document.getElementById('btn-generate-share');
        btn.disabled = true;

        try {
            const element = document.getElementById('composer-canvas');
            
            // Generate Image
            const dataUrl = await toPng(element, {
                quality: 0.95,
                pixelRatio: 2, // Retina display quality
                cacheBust: true,
                style: { transform: 'scale(1)', transformOrigin: 'top left' } // Reset transforms for capture
            });

            const blob = await (await fetch(dataUrl)).blob();
            const file = new File([blob], `nomutore_beer_${dayjs().format('YYYYMMDD')}.png`, { type: 'image/png' });

            hideLoadingOverlay(loadingId);
            
            // モーダルを閉じて、プレビューモーダル（シェア実行用）を開く
            modal.remove();
            showPreviewModal(dataUrl, file); // ここでユーザーがボタンを押すことでNotAllowedErrorを回避

        } catch (e) {
            console.error(e);
            hideLoadingOverlay(loadingId);
            showMessage('画像生成に失敗しました', 'error');
            btn.disabled = false;
        }
    };
};


/* --- 2. Graphic Flow (Fallback) --- */

const generateGraphicCard = async (mode, data) => {
    const loadingId = showLoadingOverlay('画像を生成しています...');
    try {
        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.top = '-9999px';
        container.style.left = '-9999px';
        container.style.width = '600px'; 
        container.style.zIndex = '-1';
        document.body.appendChild(container);

        renderStatusCard(container, data); // 既存のステータスカード等はここ

        await new Promise(r => setTimeout(r, 800));

        const targetElement = container.firstElementChild;
        if (!targetElement) throw new Error('Render failed');

        const dataUrl = await toPng(targetElement, { quality: 0.95, pixelRatio: 2, cacheBust: true });
        document.body.removeChild(container);
        hideLoadingOverlay(loadingId);

        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], `nomutore_share.png`, { type: 'image/png' });

        showPreviewModal(dataUrl, file);

    } catch (error) {
        console.error('Share generation failed:', error);
        if (document.getElementById(loadingId)) hideLoadingOverlay(loadingId);
        showMessage('画像の生成に失敗しました', 'error');
    }
};

/* --- 3. Share Trigger Modal (NotAllowedError回避用) --- */

const showPreviewModal = (dataUrl, file) => {
    const existing = document.getElementById('share-preview-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'share-preview-modal';
    modal.className = "fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in";
    const canShare = navigator.canShare && navigator.canShare({ files: [file] });

    modal.innerHTML = `
        <div class="bg-base-50 dark:bg-base-900 w-full max-w-md rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div class="p-4 border-b border-base-200 dark:border-base-800 flex justify-between items-center bg-white dark:bg-base-900">
                <h3 class="font-black text-lg text-base-900 dark:text-white">Ready to Share</h3>
                <button id="btn-close-preview" class="w-8 h-8 rounded-full bg-base-200 dark:bg-base-800 flex items-center justify-center text-gray-500">✕</button>
            </div>
            
            <div class="p-4 bg-gray-100 dark:bg-black/50 flex-1 overflow-auto flex items-center justify-center min-h-[300px]">
                <img src="${dataUrl}" class="w-full h-auto max-h-[60vh] object-contain rounded-xl shadow-lg border border-white/10" alt="Share Image">
            </div>
            <div class="p-4 bg-white dark:bg-base-900 border-t border-base-200 dark:border-base-800 flex gap-3">
                <button id="btn-download-img" class="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold rounded-xl text-xs flex items-center justify-center gap-2 hover:bg-gray-200 dark:hover:bg-gray-700 transition">
                    <i class="ph-bold ph-download-simple text-lg"></i> Save
                </button>
                ${canShare ? `
                <button id="btn-share-native" class="flex-[2] py-3 bg-indigo-600 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 hover:bg-indigo-700 transition active:scale-95">
                    <i class="ph-bold ph-share-network text-lg"></i> Share Now
                </button>
                ` : ''}
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('btn-close-preview').onclick = () => modal.remove();
    
    document.getElementById('btn-download-img').onclick = () => {
        const a = document.createElement('a'); a.href = dataUrl; a.download = file.name; a.click();
        Feedback.success(); showMessage('画像を保存しました', 'success'); modal.remove();
        toggleModal('action-menu-modal', false);
    };

    const shareBtn = document.getElementById('btn-share-native');
    if (shareBtn) {
        // ★重要: ここはユーザーのクリック直後に navigator.share を呼ぶため、NotAllowedError は発生しない
        shareBtn.onclick = async () => {
            try { 
                await navigator.share({ files: [file], title: 'NOMUTORE Log', text: APP.HASHTAGS }); 
                Feedback.success(); 
                modal.remove(); 
                toggleModal('action-menu-modal', false);
            } catch (err) {
                console.log('Share canceled');
            }
        };
    }
};

/* --- Internal Renderers (For Status Card - same as before) --- */
const renderStatusCard = (container) => {
    const profile = Store.getProfile();
    const { logs, checks, periodLogs } = Store.getCachedData(); 
    
    const balanceVal = Calc.calculateBalance(periodLogs);
    const isDebt = balanceVal < 0;
    const absBalance = Math.round(Math.abs(balanceVal));
    const gradeData = Calc.getRecentGrade(checks, logs, profile);

    const bgClass = isDebt 
        ? 'bg-gradient-to-br from-slate-900 to-slate-800' 
        : 'bg-gradient-to-br from-indigo-900 to-slate-900';
    
    const accentColor = isDebt ? 'text-red-400' : 'text-emerald-400';
    const statusText = isDebt ? 'DEBT (借金)' : 'SAVINGS (貯金)';
    
    const appUrl = window.location.href; 
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(appUrl)}&bgcolor=ffffff&color=000000&margin=0`;

    container.innerHTML = `
        <div class="${bgClass} w-[600px] h-[400px] p-8 flex flex-col justify-between relative overflow-hidden font-sans text-white">
            <div class="absolute top-[-50px] right-[-50px] w-64 h-64 bg-indigo-500 rounded-full mix-blend-overlay filter blur-[60px] opacity-30"></div>
            <div class="absolute bottom-[-50px] left-[-50px] w-64 h-64 bg-amber-500 rounded-full mix-blend-overlay filter blur-[60px] opacity-20"></div>

            <div class="flex justify-between items-center z-10">
                <div class="flex items-center gap-3">
                    <div class="w-12 h-12 bg-white/10 backdrop-blur-md rounded-xl flex items-center justify-center border border-white/20 overflow-hidden">
                        <img src="./icon-192_2.png" class="w-full h-full object-cover opacity-90" crossorigin="anonymous">
                    </div>
                    <div>
                        <h1 class="text-xl font-black tracking-widest leading-none">NOMUTORE</h1>
                        <p class="text-[10px] text-gray-400 font-bold tracking-[0.3em] uppercase mt-1">BEER & BURN</p>
                    </div>
                </div>
                <div class="text-right">
                    <p class="text-xs text-gray-400 font-bold tracking-wider">${dayjs().format('YYYY.MM.DD')}</p>
                </div>
            </div>

            <div class="flex-1 flex flex-col justify-center items-center z-10 mt-2">
                <p class="text-sm font-bold text-gray-400 tracking-widest mb-2 border-b border-gray-600 pb-1 whitespace-nowrap">${statusText}</p>
                <div class="text-8xl font-black ${accentColor} drop-shadow-2xl flex items-baseline gap-2 leading-none">
                    ${absBalance} <span class="text-2xl text-gray-400 font-bold">kcal</span>
                </div>
                <div class="mt-8 flex items-center gap-4 bg-white/5 px-6 py-3 rounded-full border border-white/10 backdrop-blur-sm">
                    <span class="text-xs text-gray-400 font-bold uppercase whitespace-nowrap">Current Rank</span>
                    <span class="text-2xl font-black text-amber-400 whitespace-nowrap">${gradeData.rank}</span>
                </div>
            </div>

            <div class="flex justify-between items-end z-10 pt-4">
                <div class="flex items-center gap-3">
                    <div class="w-14 h-14 bg-white p-1 rounded-lg shadow-lg">
                        <img src="${qrApiUrl}" class="w-full h-full" crossorigin="anonymous" alt="QR">
                    </div>
                    <div class="text-[10px] text-gray-400 leading-tight font-bold opacity-80">
                        Scan to join<br>the healthy drinkers.
                    </div>
                </div>
                <div class="text-right">
                    <p class="text-sm font-black italic opacity-30">#NOMUTORE</p>
                </div>
            </div>
        </div>
    `;
};


/* --- UI Helpers --- */
const showLoadingOverlay = (text) => {
    const id = `loading-${Date.now()}`;
    const el = document.createElement('div');
    el.id = id;
    el.className = "fixed inset-0 z-[10000] bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center transition-opacity duration-300";
    el.innerHTML = `<div class="text-4xl animate-bounce mb-4">📸</div><p class="text-white font-bold text-lg animate-pulse">${text}</p><div role="status" aria-live="polite" class="sr-only">${text}</div>`;
    document.body.appendChild(el);
    return id;
};

const hideLoadingOverlay = (id) => {
    const el = document.getElementById(id);
    if (el) { el.classList.add('opacity-0'); setTimeout(() => el.remove(), 300); }
};