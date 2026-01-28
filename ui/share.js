import { toPng } from 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/+esm';
import { APP } from '../constants.js';
import { Store } from '../store.js';
import { Calc } from '../logic.js';
import { DOM, showMessage, Feedback } from './dom.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

/* =========================================
   Share Engine (DOM to Image)
   ========================================= */

export const Share = {
    /**
     * シェア用画像を生成し、Web Share API (またはダウンロード) を起動する
     * @param {string} mode - 'status' | 'beer' | 'exercise'
     * @param {object} data - ログデータなど
     */
    generateAndShare: async (mode = 'status', data = null) => {
        // 1. 生成中のローディング表示 & A11yアナウンス
        const loadingId = showLoadingOverlay('画像を生成しています...');
        
        try {
            // 2. 一時的なコンテナを作成 (画面外に配置)
            const container = document.createElement('div');
            container.style.position = 'fixed';
            container.style.top = '-9999px';
            container.style.left = '-9999px';
            // SNSで見やすい比率 (1200x630 or 正方形) に近いサイズ感で作る
            container.style.width = '600px'; 
            container.style.zIndex = '-1';
            document.body.appendChild(container);

            // 3. モードに応じたHTMLをレンダリング
            if (mode === 'status') {
                renderStatusCard(container);
            } else if (mode === 'beer') {
                renderBeerCard(container, data);
            }

            // 画像読み込み待ち等のための微小な遅延
            await new Promise(r => setTimeout(r, 100));

            // 4. DOMをPNG画像(Blob)に変換
            const dataUrl = await toPng(container.firstChild, {
                quality: 0.95,
                pixelRatio: 2, // 高解像度化
                style: { transform: 'scale(1)', transformOrigin: 'top left' } // スタイル崩れ防止
            });

            // コンテナ削除
            document.body.removeChild(container);

            // 5. Blob化してシェア
            const blob = await (await fetch(dataUrl)).blob();
            const file = new File([blob], `nomutore_${dayjs().format('YYYYMMDD_HHmmss')}.png`, { type: 'image/png' });

            hideLoadingOverlay(loadingId);

            // Web Share API Level 2 (ファイル共有) 対応チェック
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: 'NOMUTORE Log',
                    text: APP.HASHTAGS // constants.jsのハッシュタグ
                });
                Feedback.success();
            } else {
                // フォールバック: ダウンロード発火
                const a = document.createElement('a');
                a.href = dataUrl;
                a.download = `nomutore_share.png`;
                a.click();
                showMessage('画像を保存しました！SNSに投稿してください。', 'success');
                Feedback.success();
            }

        } catch (error) {
            console.error('Share generation failed:', error);
            if (document.getElementById(loadingId)) hideLoadingOverlay(loadingId);
            showMessage('画像の生成に失敗しました', 'error');
            Feedback.error();
        }
    }
};

/* --- Internal Renderers (Templates) --- */

// ステータスカード（借金・貯金・ランク）
const renderStatusCard = (container) => {
    const profile = Store.getProfile();
    const { logs, checks } = Store.getCachedData(); // ※Storeにキャッシュ取得メソッドが必要(後述)
    // 無ければDBから取る必要があるが、今回は簡易的に計算済みの値を想定、あるいは再計算
    // ここではデモ用にCalcを使う（本来はService経由でデータをもらうべき）
    
    // 簡易的に現状のステータスを取得（実際は引数で渡すのがベスト）
    const balance = document.getElementById('tank-balance-kcal')?.textContent || "0";
    const isDebt = balance.includes('-'); // マイナス表記かどうかで判断
    
    // テーマカラー
    const bgClass = isDebt 
        ? 'bg-gradient-to-br from-slate-900 to-slate-800' 
        : 'bg-gradient-to-br from-indigo-900 to-slate-900';
    
    const accentColor = isDebt ? 'text-red-400' : 'text-emerald-400';
    const statusText = isDebt ? 'DEBT (借金)' : 'SAVINGS (貯金)';

    container.innerHTML = `
        <div class="${bgClass} w-[600px] h-[400px] p-8 flex flex-col justify-between relative overflow-hidden font-sans text-white">
            <div class="absolute top-[-50px] right-[-50px] w-64 h-64 bg-indigo-500 rounded-full mix-blend-overlay filter blur-[60px] opacity-30"></div>
            <div class="absolute bottom-[-50px] left-[-50px] w-64 h-64 bg-amber-500 rounded-full mix-blend-overlay filter blur-[60px] opacity-20"></div>

            <div class="flex justify-between items-center z-10">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-white/10 backdrop-blur-md rounded-xl flex items-center justify-center border border-white/20">
                        <span class="text-2xl">🍺</span>
                    </div>
                    <div>
                        <h1 class="text-xl font-black tracking-widest">NOMUTORE</h1>
                        <p class="text-[10px] text-gray-400 font-bold tracking-[0.2em] uppercase">Be Healthy, Drink Happily.</p>
                    </div>
                </div>
                <div class="text-right">
                    <p class="text-xs text-gray-400 font-bold">${dayjs().format('YYYY.MM.DD')}</p>
                </div>
            </div>

            <div class="flex-1 flex flex-col justify-center items-center z-10 mt-4">
                <p class="text-sm font-bold text-gray-400 tracking-widest mb-2 border-b border-gray-600 pb-1">${statusText}</p>
                <div class="text-8xl font-black ${accentColor} drop-shadow-2xl flex items-baseline gap-2">
                    ${balance} <span class="text-2xl text-gray-400 font-bold">kcal</span>
                </div>
                
                <div class="mt-6 flex items-center gap-4 bg-white/5 px-6 py-3 rounded-full border border-white/10 backdrop-blur-sm">
                    <span class="text-xs text-gray-400 font-bold uppercase">Current Rank</span>
                    <span class="text-xl font-black text-amber-400">Liver A+</span>
                </div>
            </div>

            <div class="flex justify-between items-end z-10 border-t border-white/10 pt-4">
                <div class="flex items-center gap-2">
                    <div class="w-16 h-16 bg-white p-1 rounded-lg">
                        <div class="w-full h-full bg-gray-900 flex items-center justify-center">
                            <i class="ph-bold ph-qr-code text-white text-2xl"></i>
                        </div>
                    </div>
                    <div class="text-[10px] text-gray-400 leading-tight">
                        Scan to join<br>the healthy drinkers.
                    </div>
                </div>
                <div class="text-right">
                    <p class="text-sm font-black italic opacity-50">#NOMUTORE</p>
                </div>
            </div>
        </div>
    `;
};

// ビール記録カード（飲んだ報告用）
const renderBeerCard = (container, log) => {
    // 実際の実装は後ほど（今回は枠組みだけ）
    container.innerHTML = `<div class="bg-amber-500 w-[600px] h-[400px]">Beer Card Placeholder</div>`;
};


/* --- UI Helpers --- */

// A11y対応のローディングオーバーレイ
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