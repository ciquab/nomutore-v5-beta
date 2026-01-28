import { toPng } from 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/+esm';
import { APP } from '../constants.js';
import { Store } from '../store.js';
import { Calc } from '../logic.js';
import { showMessage, Feedback, escapeHtml } from './dom.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

/* =========================================
   Share Engine (Photo Composer)
   ========================================= */

export const Share = {
    /**
     * シェアフローへの入り口
     * @param {string} mode - 'status' | 'beer'
     * @param {object} data - ログデータ
     */
    generateAndShare: async (mode = 'status', data = null) => {
        if (mode === 'beer') {
            // ビールの場合は写真選択フローへ
            startBeerPhotoFlow(data);
        } else {
            // ステータス等は従来のグラフィック生成へ
            generateGraphicCard(mode, data);
        }
    }
};

/* --- 1. Photo Flow (Beer) --- */

const startBeerPhotoFlow = (logData) => {
    // ファイル入力を動的生成
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
                // 画像読み込み完了後、コンポーザー（編集画面）を開く
                openPhotoComposer(readerEvent.target.result, logData);
            };
            reader.readAsDataURL(file);
        } else {
            // キャンセルされた場合、グラフィックモードにフォールバックするか確認
            if(confirm('写真なしでシェア用カードを作成しますか？')) {
                generateGraphicCard('beer', logData);
            }
        }
        input.remove();
    };

    input.click();
};

// コンポーザー（編集・プレビュー画面）の表示
const openPhotoComposer = (imgSrc, log) => {
    const existing = document.getElementById('share-composer-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'share-composer-modal';
    modal.className = "fixed inset-0 z-[9999] bg-base-950 flex flex-col animate-fade-in";

    // データ整理
    const brand = log.brand || log.name;
    const brewery = log.brewery || '';
    const style = log.style || '';
    const kcal = Math.abs(Math.round(log.kcal));
    const date = dayjs(log.timestamp).format('YYYY.MM.DD');

    modal.innerHTML = `
        <div class="p-4 flex justify-between items-center bg-black/40 backdrop-blur-md text-white z-20 absolute top-0 w-full border-b border-white/10">
            <button id="btn-cancel-composer" class="text-sm font-bold text-gray-300 hover:text-white">Cancel</button>
            <h3 class="font-black text-sm tracking-widest">SHARE PREVIEW</h3>
            <button id="btn-finalize-share" class="text-sm font-bold text-indigo-400 hover:text-indigo-300">Share</button>
        </div>

        <div class="flex-1 flex items-center justify-center bg-black overflow-hidden relative">
            <div id="composer-canvas" class="relative w-full max-w-md aspect-[3/4] bg-gray-900 shadow-2xl overflow-hidden">
                
                <img src="${imgSrc}" class="absolute inset-0 w-full h-full object-cover z-0">

                <div class="absolute bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-black/90 via-black/40 to-transparent z-10 pt-16">
                    <div class="flex items-end justify-between">
                        
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 bg-white/10 backdrop-blur-md rounded-xl border border-white/20 flex items-center justify-center shadow-lg">
                                <img src="./icon-192_2.png" class="w-full h-full object-cover opacity-90" crossorigin="anonymous">
                            </div>
                            <div class="flex flex-col text-white drop-shadow-md">
                                <span class="text-[10px] font-bold text-gray-300 uppercase tracking-wider leading-none mb-0.5">Logged with NOMUTORE</span>
                                <span class="text-lg font-black leading-none line-clamp-1">${escapeHtml(brand)}</span>
                                ${brewery ? `<span class="text-xs font-bold text-gray-300 line-clamp-1">${escapeHtml(brewery)}</span>` : ''}
                            </div>
                        </div>

                        <div id="composer-stats" class="text-right text-white drop-shadow-md transition-opacity duration-300">
                            <div class="flex flex-col items-end">
                                <span class="text-2xl font-black font-mono leading-none">-${kcal}</span>
                                <span class="text-[9px] font-bold uppercase text-red-400 tracking-wider">Debt Created</span>
                            </div>
                        </div>

                    </div>
                    
                    <div class="absolute top-4 right-4 text-[10px] font-mono font-bold text-white/50 tracking-widest opacity-0">
                        ${date}
                    </div>
                </div>
            </div>
        </div>

        <div class="p-6 bg-base-900 border-t border-gray-800 z-20 flex flex-col gap-4">
            
            <label class="flex items-center justify-between cursor-pointer p-3 bg-gray-800 rounded-xl">
                <span class="text-sm font-bold text-gray-300">Show Calories (Debt)</span>
                <div class="relative inline-flex items-center">
                    <input type="checkbox" id="toggle-kcal" class="sr-only peer" checked>
                    <div class="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500"></div>
                </div>
            </label>

            <p class="text-xs text-gray-500 text-center">
                ※画像はトリミングされず、中央に配置されます。
            </p>
        </div>
    `;

    document.body.appendChild(modal);

    // Event Listeners
    document.getElementById('btn-cancel-composer').onclick = () => modal.remove();

    // カロリー表示切り替え
    const toggleKcal = document.getElementById('toggle-kcal');
    const statsEl = document.getElementById('composer-stats');
    toggleKcal.onchange = (e) => {
        if (e.target.checked) {
            statsEl.classList.remove('opacity-0');
        } else {
            statsEl.classList.add('opacity-0');
        }
        Feedback.tap();
    };

    // シェア実行
    document.getElementById('btn-finalize-share').onclick = async () => {
        const loadingId = showLoadingOverlay('画像を生成中...');
        try {
            const element = document.getElementById('composer-canvas');
            
            // Generate Image
            const dataUrl = await toPng(element, {
                quality: 0.95,
                pixelRatio: 2,
                cacheBust: true,
                style: { transform: 'scale(1)', transformOrigin: 'top left' }
            });

            // Blob化
            const blob = await (await fetch(dataUrl)).blob();
            const file = new File([blob], `nomutore_beer_${dayjs().format('YYYYMMDD')}.png`, { type: 'image/png' });

            hideLoadingOverlay(loadingId);
            modal.remove();

            // Native Share
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: 'Beer Log',
                    text: APP.HASHTAGS
                });
            } else {
                // Download fallback
                const a = document.createElement('a');
                a.href = dataUrl;
                a.download = file.name;
                a.click();
                showMessage('画像を保存しました', 'success');
            }
            Feedback.success();

        } catch (e) {
            console.error(e);
            hideLoadingOverlay(loadingId);
            showMessage('画像生成に失敗しました', 'error');
        }
    };
};


/* --- 2. Graphic Flow (Status / Fallback) --- */

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

        if (mode === 'status') {
            renderStatusCard(container);
        } else if (mode === 'beer') {
            renderBeerGraphicCard(container, data); // Fallback graphic
        }

        await new Promise(r => setTimeout(r, 800));

        const targetElement = container.firstElementChild;
        if (!targetElement) throw new Error('Render failed');

        const dataUrl = await toPng(targetElement, { 
            quality: 0.95, pixelRatio: 2, cacheBust: true 
        });

        document.body.removeChild(container);
        hideLoadingOverlay(loadingId);

        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], `nomutore_share.png`, { type: 'image/png' });

        showPreviewModal(dataUrl, file); // 従来のプレビューモーダル（必要であれば）

    } catch (error) {
        console.error('Share generation failed:', error);
        if (document.getElementById(loadingId)) hideLoadingOverlay(loadingId);
        showMessage('画像の生成に失敗しました', 'error');
    }
};


/* --- Internal Renderers (For Graphic Mode) --- */

const renderStatusCard = (container) => {
    // (既存のStatus Card描画ロジックをここに維持)
    // ※文字数制限のため、前回のStatus Card実装と同じコードが入っていると仮定します
    // 必要であれば前回のコードを再掲します
    const profile = Store.getProfile();
    const { logs, checks, periodLogs } = Store.getCachedData(); 
    const balanceVal = Calc.calculateBalance(periodLogs);
    const isDebt = balanceVal < 0;
    const absBalance = Math.round(Math.abs(balanceVal));
    const gradeData = Calc.getRecentGrade(checks, logs, profile);
    const bgClass = isDebt ? 'bg-gradient-to-br from-slate-900 to-slate-800' : 'bg-gradient-to-br from-indigo-900 to-slate-900';
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
                <div class="text-right"><p class="text-xs text-gray-400 font-bold tracking-wider">${dayjs().format('YYYY.MM.DD')}</p></div>
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
                    <div class="text-[10px] text-gray-400 leading-tight font-bold opacity-80">Scan to join<br>the healthy drinkers.</div>
                </div>
                <div class="text-right"><p class="text-sm font-black italic opacity-30">#NOMUTORE</p></div>
            </div>
        </div>
    `;
};

// ビール用グラフィックカード (写真なしの場合のフォールバック)
const renderBeerGraphicCard = (container, log) => {
    // (前回の renderBeerCard と同じ内容)
    // 省略せずに記述します
    const name = log.brand || log.name || 'Unknown Beer';
    const brewery = log.brewery || '';
    const style = log.style || 'Beer';
    const kcal = Math.abs(Math.round(log.kcal));
    const amount = (log.size || 350) * (log.count || 1);
    const count = log.count || 1;
    const rating = log.rating || 0;
    const date = dayjs(log.timestamp).format('YYYY.MM.DD HH:mm');
    let colorClass = 'from-amber-500 to-orange-600';
    const styleLower = style.toLowerCase();
    if (styleLower.includes('stout') || styleLower.includes('porter') || styleLower.includes('schwarz') || styleLower.includes('dark')) colorClass = 'from-gray-900 to-black';
    else if (styleLower.includes('ipa') || styleLower.includes('pale')) colorClass = 'from-orange-400 to-amber-600';
    else if (styleLower.includes('white') || styleLower.includes('weizen') || styleLower.includes('hazy')) colorClass = 'from-yellow-200 to-orange-300';
    else if (styleLower.includes('lager') || styleLower.includes('pilsner')) colorClass = 'from-yellow-400 to-amber-500';

    let starsHtml = rating > 0 ? `<div class="flex gap-1 text-yellow-400 text-2xl drop-shadow-sm">${'★'.repeat(rating)}${'<span class="opacity-30">★</span>'.repeat(5-rating)}</div>` : '';

    container.innerHTML = `
        <div class="bg-gradient-to-br ${colorClass} w-[600px] h-[400px] p-8 flex flex-col relative overflow-hidden font-sans text-white">
            <div class="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-black/40 to-transparent pointer-events-none"></div>
            <div class="absolute top-[-20%] right-[-10%] w-64 h-64 bg-white/10 rounded-full blur-[50px]"></div>
            <div class="absolute bottom-[-10%] left-[-10%] w-48 h-48 bg-black/20 rounded-full blur-[40px]"></div>
            <div class="flex justify-between items-center z-10 opacity-90 border-b border-white/10 pb-4 mb-4">
                <div class="flex items-center gap-3">
                    <div class="w-12 h-12 bg-white/10 backdrop-blur-md rounded-xl flex items-center justify-center border border-white/20 overflow-hidden">
                        <img src="./icon-192_2.png" class="w-full h-full object-cover opacity-90" crossorigin="anonymous">
                    </div>
                    <div><h1 class="text-xl font-black tracking-widest leading-none">NOMUTORE</h1><p class="text-[10px] text-gray-400 font-bold tracking-[0.3em] uppercase mt-1">BEER & BURN</p></div>
                </div>
                <span class="text-xs font-mono font-bold opacity-80">${date}</span>
            </div>
            <div class="flex-1 flex flex-col justify-center z-10 pl-2">
                ${brewery ? `<p class="text-xl font-bold opacity-80 mb-1 uppercase tracking-wide leading-none">${escapeHtml(brewery)}</p>` : ''}
                <h1 class="text-5xl font-black leading-tight mb-4 drop-shadow-md line-clamp-2 w-[95%]">${escapeHtml(name)}</h1>
                <div class="flex items-center gap-4 mb-8">
                    <div class="px-4 py-1.5 bg-black/20 backdrop-blur-md rounded-full text-sm font-bold border border-white/10">${escapeHtml(style)}</div>
                    ${starsHtml}
                </div>
                <div class="flex items-end gap-3 bg-black/20 self-start pr-8 pl-4 py-2 rounded-2xl backdrop-blur-sm border border-white/5">
                    <span class="text-6xl font-black text-white drop-shadow-lg">-${kcal}</span>
                    <div class="flex flex-col mb-2"><span class="text-xs font-bold uppercase opacity-60">Debt Created</span><span class="text-sm font-bold opacity-90">kcal</span></div>
                </div>
            </div>
            <div class="z-10 flex justify-between items-end mt-2">
                <div class="text-xs font-bold opacity-70">Amount: ${amount}ml <span class="opacity-50">(${count} cans)</span></div>
                <div class="text-xl font-black italic opacity-50">#NOMUTORE</div>
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

// プレビューモーダル（グラフィックモード用）
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
                <h3 class="font-black text-lg text-base-900 dark:text-white">Share Preview</h3>
                <button id="btn-close-preview" class="w-8 h-8 rounded-full bg-base-200 dark:bg-base-800 flex items-center justify-center text-gray-500">✕</button>
            </div>
            <div class="p-4 bg-gray-100 dark:bg-black/50 flex-1 overflow-auto flex items-center justify-center">
                <img src="${dataUrl}" class="w-full h-auto rounded-xl shadow-lg border border-white/10" alt="Share Image">
            </div>
            <div class="p-4 bg-white dark:bg-base-900 border-t border-base-200 dark:border-base-800 flex gap-3">
                <button id="btn-download-img" class="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold rounded-xl text-xs flex items-center justify-center gap-2 hover:bg-gray-200 dark:hover:bg-gray-700 transition"><i class="ph-bold ph-download-simple text-lg"></i> Save</button>
                ${canShare ? `<button id="btn-share-native" class="flex-[2] py-3 bg-indigo-600 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 hover:bg-indigo-700 transition active:scale-95"><i class="ph-bold ph-share-network text-lg"></i> Share</button>` : ''}
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('btn-close-preview').onclick = () => modal.remove();
    document.getElementById('btn-download-img').onclick = () => {
        const a = document.createElement('a'); a.href = dataUrl; a.download = file.name; a.click();
        Feedback.success(); showMessage('画像を保存しました', 'success'); modal.remove();
    };
    const shareBtn = document.getElementById('btn-share-native');
    if (shareBtn) {
        shareBtn.onclick = async () => {
            try { await navigator.share({ files: [file], title: 'NOMUTORE Log', text: APP.HASHTAGS }); Feedback.success(); modal.remove(); } catch (err) {}
        };
    }
};