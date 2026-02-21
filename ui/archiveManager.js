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

const createArchiveDetailModal = (archive) => {
    const existing = document.getElementById(ARCHIVE_DETAIL_MODAL_ID);
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = ARCHIVE_DETAIL_MODAL_ID;
    modal.className = 'fixed inset-0 z-[1200] hidden items-end sm:items-center justify-center';
    modal.dataset.destroy = 'true';

    const logs = archive.logs || [];
    const start = dayjs(archive.startDate).format('YYYY/MM/DD');
    const end = dayjs(archive.endDate).format('YYYY/MM/DD');
    const balance = Math.round(archive.totalBalance || 0);
    const isPositive = balance >= 0;
    const sign = isPositive ? '+' : '';

    const logsHtml = logs.length > 0
        ? logs
            .slice()
            .sort((a, b) => b.timestamp - a.timestamp)
            .map((log) => {
                const logDate = dayjs(log.timestamp).format('MM/DD HH:mm');
                const kcal = Math.round(log.kcal || 0);
                const logSign = kcal >= 0 ? '+' : '';
                const name = log.brand || log.name || '記録';

                return `
                    <button type="button" class="w-full text-left px-3 py-2 rounded-xl bg-white dark:bg-base-900 border border-base-100 dark:border-base-800 active:scale-[0.98] transition" data-archive-log-id="${log.id || ''}" data-archive-log-ts="${log.timestamp}">
                        <div class="flex items-center justify-between gap-2">
                            <div>
                                <div class="text-sm font-bold text-base-900 dark:text-white">${escapeHtml(name)}</div>
                                <div class="text-[11px] text-gray-500 dark:text-gray-400">${logDate} · ${log.type === 'beer' ? '飲酒' : '運動'}</div>
                            </div>
                            <div class="text-sm font-black ${kcal >= 0 ? 'text-indigo-500' : 'text-red-500'}">${logSign}${kcal} kcal</div>
                        </div>
                    </button>
                `;
            })
            .join('')
        : '<p class="text-xs text-gray-500 dark:text-gray-400">この期間のログ情報は保存されていません。</p>';

    modal.innerHTML = `
        <div id="${ARCHIVE_DETAIL_MODAL_ID}-bg" class="modal-bg absolute inset-0 bg-black/55 opacity-0 transition-opacity duration-300"></div>
        <div class="relative w-full sm:max-w-2xl max-h-[88vh] bg-base-50 dark:bg-base-950 rounded-t-3xl sm:rounded-3xl shadow-2xl transform transition-all duration-300 ease-out translate-y-full sm:translate-y-10">
            <div class="p-4 border-b border-base-200 dark:border-base-800 flex items-center justify-between">
                <div>
                    <p class="text-xs font-bold text-gray-500 dark:text-gray-400">${formatModeLabel(archive.mode)}</p>
                    <h3 class="text-lg font-black text-base-900 dark:text-white">${start} - ${end}</h3>
                </div>
                <button id="${ARCHIVE_DETAIL_MODAL_ID}-close" class="w-10 h-10 rounded-full bg-base-200 dark:bg-base-800 text-base-700 dark:text-base-200">
                    <i class="ph-bold ph-x"></i>
                </button>
            </div>

            <div class="p-4 overflow-y-auto max-h-[65vh] space-y-4">
                <div class="grid grid-cols-3 gap-2 text-center">
                    <div class="rounded-xl bg-white dark:bg-base-900 border border-base-100 dark:border-base-800 p-2">
                        <p class="text-[11px] text-gray-500 dark:text-gray-400">収支</p>
                        <p class="text-base font-black ${isPositive ? 'text-emerald-500' : 'text-red-500'}">${sign}${balance}</p>
                    </div>
                    <div class="rounded-xl bg-white dark:bg-base-900 border border-base-100 dark:border-base-800 p-2">
                        <p class="text-[11px] text-gray-500 dark:text-gray-400">ログ件数</p>
                        <p class="text-base font-black text-base-900 dark:text-white">${logs.length}</p>
                    </div>
                    <div class="rounded-xl bg-white dark:bg-base-900 border border-base-100 dark:border-base-800 p-2">
                        <p class="text-[11px] text-gray-500 dark:text-gray-400">ID</p>
                        <p class="text-base font-black text-base-900 dark:text-white">#${archive.id}</p>
                    </div>
                </div>

                <section class="space-y-2">
                    <h4 class="text-xs font-bold text-gray-500 dark:text-gray-400">期間ログ</h4>
                    ${logsHtml}
                </section>
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
            <h3 class="section-title text-sm font-bold text-base-900 dark:text-white">アーカイブ</h3>
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
