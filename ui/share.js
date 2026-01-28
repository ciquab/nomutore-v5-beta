import { toPng } from 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/+esm';
import { APP, STYLE_METADATA } from '../constants.js';
import { Store } from '../store.js';
import { Calc } from '../logic.js';
import { DOM, showMessage, Feedback, escapeHtml } from './dom.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

/* =========================================
   Share Engine (Preview & Share)
   ========================================= */

export const Share = {
    /**
     * シェア用画像を生成し、プレビューモーダルを表示する
     */
    generateAndShare: async (mode = 'status', data = null) => {
        const loadingId = showLoadingOverlay('画像を生成しています...');
        
        try {
            // 1. 一時的なコンテナを作成 (画面外)
            const container = document.createElement('div');
            container.style.position = 'fixed';
            container.style.top = '-9999px';
            container.style.left = '-9999px';
            container.style.width = '600px'; 
            container.style.zIndex = '-1';
            document.body.appendChild(container);

            // 2. HTMLレンダリング
            if (mode === 'status') {
                renderStatusCard(container);
            } else if (mode === 'beer') {
                renderBeerCard(container, data);
            }

            // 画像読み込み待ち (QRコード等)
            await new Promise(r => setTimeout(r, 800));

            const targetElement = container.firstElementChild;
            if (!targetElement) {
                throw new Error('Render failed: Element not found');
            }

            // 3. 画像化 (PNG)
            const dataUrl = await toPng(targetElement, { 
                quality: 0.95,
                pixelRatio: 2,
                cacheBust: true, 
                style: { transform: 'scale(1)', transformOrigin: 'top left' }
            });

            document.body.removeChild(container);
            hideLoadingOverlay(loadingId);

            // 4. Blob化
            const blob = await (await fetch(dataUrl)).blob();
            const filename = `nomutore_${dayjs().format('YYYYMMDD_HHmmss')}.png`;
            const file = new File([blob], filename, { type: 'image/png' });

            // 5. プレビューモーダルを表示 (ここでユーザーにボタンを押させる)
            showPreviewModal(dataUrl, file);

        } catch (error) {
            console.error('Share generation failed:', error);
            if (document.getElementById(loadingId)) hideLoadingOverlay(loadingId);
            showMessage('画像の生成に失敗しました', 'error');
            Feedback.error();
        }
    }
};

/* --- Preview Modal (Dynamic UI) --- */

const showPreviewModal = (dataUrl, file) => {
    // 既存があれば消す
    const existing = document.getElementById('share-preview-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'share-preview-modal';
    modal.className = "fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in";
    
    // Web Share APIが使えるか判定
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
                <button id="btn-download-img" class="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold rounded-xl text-xs flex items-center justify-center gap-2 hover:bg-gray-200 dark:hover:bg-gray-700 transition">
                    <i class="ph-bold ph-download-simple text-lg"></i> Save
                </button>
                
                ${canShare ? `
                <button id="btn-share-native" class="flex-[2] py-3 bg-indigo-600 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 hover:bg-indigo-700 transition active:scale-95">
                    <i class="ph-bold ph-share-network text-lg"></i> Share
                </button>
                ` : ''}
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Event Listeners
    document.getElementById('btn-close-preview').onclick = () => modal.remove();
    
    // 保存ボタン
    document.getElementById('btn-download-img').onclick = () => {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = file.name;
        a.click();
        Feedback.success();
        showMessage('画像を保存しました', 'success');
        modal.remove();
    };

    // シェアボタン (存在する場合)
    const shareBtn = document.getElementById('btn-share-native');
    if (shareBtn) {
        shareBtn.onclick = async () => {
            try {
                await navigator.share({
                    files: [file],
                    title: 'NOMUTORE Log',
                    text: APP.HASHTAGS 
                });
                Feedback.success();
                modal.remove();
            } catch (err) {
                console.log('Share canceled or failed', err);
                // シェアキャンセルはエラー扱いしなくて良い
            }
        };
    }
};

/* --- Internal Renderers (Templates) --- */

// ステータスカード
const renderStatusCard = (container) => {
    const profile = Store.getProfile();
    // 期間指定に対応したデータを取得
    const { logs, checks, periodLogs } = Store.getCachedData(); 
    
    // バランス計算 (期間データ)
    const balanceVal = Calc.calculateBalance(periodLogs);
    const isDebt = balanceVal < 0;
    const absBalance = Math.round(Math.abs(balanceVal));
    
    // ランク計算 (全期間データ)
    const gradeData = Calc.getRecentGrade(checks, logs, profile);

    const bgClass = isDebt 
        ? 'bg-gradient-to-br from-slate-900 to-slate-800' 
        : 'bg-gradient-to-br from-indigo-900 to-slate-900';
    
    const accentColor = isDebt ? 'text-red-400' : 'text-emerald-400';
    const statusText = isDebt ? 'DEBT (借金)' : 'SAVINGS (貯金)';
    
    const appUrl = window.location.href; 
    // QRコードAPI (High quality)
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

// ビール記録カード
const renderBeerCard = (container, log) => {
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
    if (styleLower.includes('stout') || styleLower.includes('porter') || styleLower.includes('schwarz') || styleLower.includes('dark')) {
        colorClass = 'from-gray-900 to-black';
    } else if (styleLower.includes('ipa') || styleLower.includes('pale')) {
        colorClass = 'from-orange-400 to-amber-600';
    } else if (styleLower.includes('white') || styleLower.includes('weizen') || styleLower.includes('hazy')) {
        colorClass = 'from-yellow-200 to-orange-300';
    } else if (styleLower.includes('lager') || styleLower.includes('pilsner')) {
        colorClass = 'from-yellow-400 to-amber-500';
    }

    let starsHtml = '';
    if (rating > 0) {
        starsHtml = `
            <div class="flex gap-1 text-yellow-400 text-2xl drop-shadow-sm">
                ${'★'.repeat(rating)}${'<span class="opacity-30">★</span>'.repeat(5-rating)}
            </div>
        `;
    }

    container.innerHTML = `
        <div class="bg-gradient-to-br ${colorClass} w-[600px] h-[400px] p-8 flex flex-col relative overflow-hidden font-sans text-white">
            <div class="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-black/40 to-transparent pointer-events-none"></div>
            <div class="absolute top-[-20%] right-[-10%] w-64 h-64 bg-white/10 rounded-full blur-[50px]"></div>
            <div class="absolute bottom-[-10%] left-[-10%] w-48 h-48 bg-black/20 rounded-full blur-[40px]"></div>

            <div class="flex justify-between items-start z-10 opacity-90 border-b border-white/10 pb-4 mb-4">
                <div class="flex items-center gap-2">
                    <div class="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-md overflow-hidden">
                         <img src="./icon-192_2.png" class="w-full h-full object-cover" crossorigin="anonymous">
                    </div>
                    <span class="text-xs font-bold tracking-[0.2em] uppercase">BEER & BURN</span>
                </div>
                <span class="text-xs font-mono font-bold opacity-80">${date}</span>
            </div>

            <div class="flex-1 flex flex-col justify-center z-10 pl-2">
                ${brewery ? `<p class="text-xl font-bold opacity-80 mb-1 uppercase tracking-wide leading-none">${escapeHtml(brewery)}</p>` : ''}
                
                <h1 class="text-5xl font-black leading-tight mb-4 drop-shadow-md line-clamp-2 w-[95%]">
                    ${escapeHtml(name)}
                </h1>
                
                <div class="flex items-center gap-4 mb-8">
                    <div class="px-4 py-1.5 bg-black/20 backdrop-blur-md rounded-full text-sm font-bold border border-white/10">
                        ${escapeHtml(style)}
                    </div>
                    ${starsHtml}
                </div>

                <div class="flex items-end gap-3 bg-black/20 self-start pr-8 pl-4 py-2 rounded-2xl backdrop-blur-sm border border-white/5">
                    <span class="text-6xl font-black text-white drop-shadow-lg">-${kcal}</span>
                    <div class="flex flex-col mb-2">
                        <span class="text-xs font-bold uppercase opacity-60">Debt Created</span>
                        <span class="text-sm font-bold opacity-90">kcal</span>
                    </div>
                </div>
            </div>

            <div class="z-10 flex justify-between items-end mt-2">
                <div class="text-xs font-bold opacity-70">
                    Amount: ${amount}ml <span class="opacity-50">(${count} cans)</span>
                </div>
                <div class="text-xl font-black italic opacity-50">
                    #NOMUTORE
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
    el.innerHTML = `
        <div class="text-4xl animate-bounce mb-4">📸</div>
        <p class="text-white font-bold text-lg animate-pulse">${text}</p>
        <div role="status" aria-live="polite" class="sr-only">${text}</div>
    `;
    document.body.appendChild(el);
    return id;
};

const hideLoadingOverlay = (id) => {
    const el = document.getElementById(id);
    if (el) {
        el.classList.add('opacity-0');
        setTimeout(() => el.remove(), 300);
    }
};