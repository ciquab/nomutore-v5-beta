// @ts-check
import { Service } from '../service.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';
import { escapeHtml, toggleModal } from './dom.js';
import { openLogDetail } from './logDetail.js';

const ARCHIVE_DETAIL_MODAL_ID = 'archive-detail-modal';

const formatModeLabel = (mode) => {
    const labels = {
        weekly: 'Weekly',
        monthly: 'Monthly',
        custom: 'Custom',
        permanent: 'Permanent'
    };
    return labels[mode] || mode || 'Unknown';
};

const summarizeArchiveLogs = (logs) => {
    let earned = 0;
    let consumed = 0;

    logs.forEach((log) => {
        const kcal = log.kcal || 0;
        if (kcal > 0) earned += kcal;
        else consumed += kcal;
    });

    return {
        earned: Math.round(earned),
        consumed: Math.round(consumed)
    };
};

const buildArchiveLogRows = (logs) => {
    if (logs.length === 0) {
        return `
            <div class="flex flex-col items-center justify-center h-40 text-gray-500 dark:text-gray-400 opacity-60">
                <i class="ph-duotone ph-notebook text-4xl mb-2" aria-hidden="true"></i>
                <span class="text-xs font-bold">この期間の記録はありません</span>
            </div>
        `;
    }

    return logs
        .slice()
        .sort((a, b) => b.timestamp - a.timestamp)
        .map((log) => {
            const isBeer = log.type === 'beer';
            const iconBg = isBeer
                ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-500'
                : 'bg-indigo-100 text-brand dark:bg-indigo-900/30 dark:text-brand-light';
            const iconClass = isBeer ? 'ph-beer-bottle' : 'ph-person-simple-run';
            const kcal = Math.round(log.kcal || 0);
            const logDate = dayjs(log.timestamp).format('MM/DD HH:mm');

            let mainText = log.name || '記録';
            let subText = logDate;
            if (isBeer) {
                mainText = (log.brand && log.brand.trim()) ? log.brand : (log.style || log.name || 'ビール');
                if (log.count && log.count > 1) {
                    mainText += ` x${log.count}`;
                }
                const sizeStr = log.size ? `${log.size}ml` : '';
                subText = `${logDate} · ${log.style || ''} ${sizeStr}`.trim();
            } else {
                subText = `${logDate} · ${log.minutes || 0} min`;
            }

            return `
                <button type="button" class="w-full flex items-center justify-between p-3 bg-white dark:bg-base-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm active:scale-[0.98] transition" data-archive-log-id="${log.id || ''}" data-archive-log-ts="${log.timestamp}">
                    <div class="flex items-center gap-3 overflow-hidden">
                        <div class="w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center shrink-0">
                            <i class="ph-fill ${iconClass} text-xl" aria-hidden="true"></i>
                        </div>
                        <div class="flex flex-col overflow-hidden text-left">
                            <span class="text-sm font-bold text-gray-800 dark:text-gray-200 truncate">${escapeHtml(mainText)}</span>
                            <span class="text-[11px] text-gray-500 dark:text-gray-400 font-bold truncate">${escapeHtml(subText)}</span>
                        </div>
                    </div>
                    <div class="text-right shrink-0 ml-2">
                        <span class="block text-sm font-black ${isBeer ? 'text-red-500' : 'text-emerald-500'}">
                            ${kcal > 0 ? '+' : ''}${kcal} <span class="text-[11px]">kcal</span>
                        </span>
                    </div>
                </button>
            `;
        })
        .join('');
};

const createArchiveDetailModal = (archive) => {
    const existing = document.getElementById(ARCHIVE_DETAIL_MODAL_ID);
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = ARCHIVE_DETAIL_MODAL_ID;
    modal.className = 'fixed inset-0 z-50 hidden items-end sm:items-center justify-center pointer-events-none';
    modal.dataset.destroy = 'true';

    const logs = archive.logs || [];
    const start = dayjs(archive.startDate).format('YYYY/MM/DD');
    const end = dayjs(archive.endDate).format('YYYY/MM/DD');
    const balance = Math.round(archive.totalBalance || 0);
    const isPositive = balance >= 0;
    const sign = isPositive ? '+' : '';
    const { earned, consumed } = summarizeArchiveLogs(logs);

    modal.innerHTML = `
        <div id="${ARCHIVE_DETAIL_MODAL_ID}-bg" class="modal-bg absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 opacity-0 pointer-events-auto"></div>

        <div class="relative w-full sm:max-w-md h-[85vh] sm:h-[80vh] bg-white dark:bg-base-900 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden transform transition-all duration-300 translate-y-full sm:translate-y-10 scale-95 opacity-0 pointer-events-auto">
            <div class="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-gray-300 dark:bg-gray-600 rounded-full sm:hidden z-20"></div>
            <div class="relative z-10 p-5 pt-8 sm:pt-5 border-b border-gray-200 dark:border-base-800 bg-white/90 dark:bg-base-900/90 backdrop-blur-md shrink-0">
                <div class="flex items-center justify-between mb-2">
                    <h3 class="text-3xl font-black text-gray-900 dark:text-white font-['Outfit'] leading-none tracking-tight">期間詳細</h3>
                    <button id="${ARCHIVE_DETAIL_MODAL_ID}-close" class="w-11 h-11 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center transition text-gray-500 dark:text-gray-400 active:scale-90">
                        <i class="ph-bold ph-x"></i>
                    </button>
                </div>
                <div class="flex items-center gap-2 mb-2">
                    <span class="text-[11px] font-bold px-2 py-0.5 rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300">${formatModeLabel(archive.mode)}</span>
                    <span class="text-xs font-bold text-gray-500 dark:text-gray-400">${start} - ${end}</span>
                </div>
                <div class="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mt-1.5">アーカイブサマリー</div>
            </div>

            <div class="p-4 bg-white/90 dark:bg-base-900/90 border-b border-gray-100 dark:border-base-800 shrink-0">
                <div class="grid grid-cols-3 gap-3 mb-2 text-center">
                    <div class="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl border border-emerald-100 dark:border-emerald-800/50">
                        <div class="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-0.5">PAYBACK</div>
                        <div class="text-lg font-black text-emerald-600 dark:text-emerald-400 font-['Outfit']">+${earned}</div>
                    </div>
                    <div class="p-3 bg-red-50 dark:bg-red-900/20 rounded-2xl border border-red-100 dark:border-red-800/50">
                        <div class="text-[11px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider mb-0.5">DEBT</div>
                        <div class="text-lg font-black text-red-600 dark:text-red-400 font-['Outfit']">${consumed}</div>
                    </div>
                    <div class="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl border border-indigo-100 dark:border-indigo-800/50">
                        <div class="text-[11px] font-bold text-brand dark:text-brand-light uppercase tracking-wider mb-0.5">BALANCE</div>
                        <div class="text-lg font-black text-brand dark:text-brand-light font-['Outfit']">${sign}${balance}</div>
                    </div>
                </div>
                <div class="text-[11px] text-gray-500 dark:text-gray-400 font-bold">ログ件数: ${logs.length}件 / Archive #${archive.id}</div>
            </div>

            <div class="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 relative z-0 overscroll-contain">
                ${buildArchiveLogRows(logs)}
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => toggleModal(ARCHIVE_DETAIL_MODAL_ID, false);
    modal.querySelector(`#${ARCHIVE_DETAIL_MODAL_ID}-bg`)?.addEventListener('click', closeModal);
    modal.querySelector(`#${ARCHIVE_DETAIL_MODAL_ID}-close`)?.addEventListener('click', closeModal);

    toggleModal(ARCHIVE_DETAIL_MODAL_ID, true);
};

const openArchiveDetail = async (archiveId) => {
    const archives = await Service.getArchives();
    const archive = archives.find(a => a.id === archiveId);
    if (!archive) return;
    createArchiveDetailModal(archive);
};

export async function renderArchives() {
    const container = document.getElementById('view-cellar-archives');
    if (!container) return;

    const archives = await Service.getArchives();

    const headerHtml = `
        <section class="px-1 mb-3">
            <h3 class="section-title text-sm font-bold text-base-900 dark:text-white">アーカイブ履歴</h3>
            <p class="section-helper mt-0.5">完了した期間の結果を一覧で確認できます</p>
        </section>
    `;

    if (archives.length === 0) {
        container.innerHTML = `
            ${headerHtml}
            <div class="empty-state flex flex-col items-center justify-center h-64 text-gray-500 dark:text-gray-400">
                <i class="ph-duotone ph-archive text-4xl mb-2" aria-hidden="true"></i>
                <p class="text-sm font-bold">アーカイブはまだありません</p>
                <p class="text-xs opacity-60">期間が完了するとここに表示されます</p>
            </div>
        `;
        return;
    }

    const html = archives.map(arch => {
        const start = dayjs(arch.startDate).format('YYYY/MM/DD');
        const end = dayjs(arch.endDate).format('MM/DD');
        const balance = arch.totalBalance || 0;
        const isPositive = balance >= 0;

        const statusColor = isPositive ? 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'text-red-500 bg-red-50 dark:bg-red-900/20';
        const sign = isPositive ? '+' : '';

        return `
            <button type="button" class="item-card glass-panel w-full p-4 rounded-2xl mb-3 flex items-center justify-between group active:scale-95 transition cursor-pointer" data-archive-id="${arch.id}">
                <div>
                    <div class="flex items-center gap-2 mb-1">
                        <span class="text-[11px] font-semibold uppercase text-gray-500 dark:text-gray-400 px-1.5 py-0.5 border border-gray-200 dark:border-gray-700 rounded">${formatModeLabel(arch.mode)}</span>
                        <span class="text-xs font-bold text-gray-600 dark:text-gray-300">${start} - ${end}</span>
                    </div>
                    <div class="text-[11px] text-gray-500 dark:text-gray-400">ID: #${arch.id}</div>
                </div>
                <div class="flex flex-col items-end">
                    <span class="text-lg font-black ${isPositive ? 'text-emerald-500' : 'text-red-500'}">
                        ${sign}${Math.round(balance)} <span class="text-xs font-bold text-gray-500 dark:text-gray-400">kcal</span>
                    </span>
                    <span class="text-[11px] font-bold px-2 py-0.5 rounded-full ${statusColor}">
                        ${isPositive ? '黒字' : '赤字'}
                    </span>
                </div>
            </button>
        `;
    }).join('');

    container.innerHTML = `${headerHtml}<div class="pb-20">${html}</div>`;
}

let _archiveListenersAttached = false;
if (!_archiveListenersAttached) {
    document.addEventListener('click', async (e) => {
        const archiveButton = /** @type {HTMLElement|null} */(e.target instanceof Element ? e.target.closest('[data-archive-id]') : null);
        if (archiveButton) {
            const archiveId = parseInt(archiveButton.dataset.archiveId || '0');
            if (archiveId) {
                await openArchiveDetail(archiveId);
            }
            return;
        }

        const archiveLogButton = /** @type {HTMLElement|null} */(e.target instanceof Element ? e.target.closest('[data-archive-log-ts]') : null);
        if (!archiveLogButton) return;

        const ts = parseInt(archiveLogButton.dataset.archiveLogTs || '0');
        if (!ts) return;

        const logId = parseInt(archiveLogButton.dataset.archiveLogId || '0');
        let targetLog = null;

        if (logId) {
            targetLog = await Service.getLogById(logId);
        }

        if (!targetLog) {
            const archives = await Service.getArchives();
            for (const arch of archives) {
                const logs = arch.logs || [];
                const found = logs.find(log => log.timestamp === ts && (log.id ? log.id === logId : true));
                if (found) {
                    targetLog = found;
                    break;
                }
            }
        }

        if (targetLog) {
            toggleModal(ARCHIVE_DETAIL_MODAL_ID, false);
            setTimeout(() => openLogDetail(targetLog), 160);
        }
    });

    _archiveListenersAttached = true;
}
