// @ts-check
import { Calc, getVirtualDate } from '../logic.js';
import { DOM, escapeHtml } from './dom.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

export function renderCheckStatus(checks, logs) {
    const status = DOM.elements['check-status'] || document.getElementById('check-status');
    if(!status) return;

    const vTodayStr = getVirtualDate(); // 文字列 'YYYY-MM-DD'
    const today = dayjs(vTodayStr);     // dayjsオブジェクト化
    const yest = today.subtract(1, 'day');
    
    const todayCheck = checks.find(c => dayjs(c.timestamp).isSame(today, 'day') && c.isSaved === true);
    const yestCheck = checks.find(c => dayjs(c.timestamp).isSame(yest, 'day') && c.isSaved === true);

    let targetCheck = null;
    let type = 'none';

    if (todayCheck) {
        targetCheck = todayCheck;
        type = 'today';
    } else if (yestCheck) {
        targetCheck = yestCheck;
        type = 'yesterday';
    }

    let theme = {
        bg: "", darkBg: "",
        text: "text-gray-800", darkText: "dark:text-white",
        iconColor: "text-gray-300", iconName: "ph-clipboard-text",
        accent: "bg-gray-200"
    };
    
    let label = "Daily Check";
    let mainStatus = "No Record";
    let subStatus = "記録がありません";
    let bottomContent = `<span class="text-[11px] font-semibold opacity-60">Tap to record</span>`;

    if (type !== 'none') {
        const { short, desc, score } = analyzeCondition(targetCheck, logs);
        
        if (type === 'today') {
            label = "Today's Cond.";
            if (score >= 3) { 
                theme = { 
                    bg: "bg-emerald-50", darkBg: "dark:bg-emerald-900/20",
                    text: "text-emerald-900", darkText: "dark:text-emerald-100",
                    iconColor: "text-emerald-500", iconName: "ph-smiley"
                };
            } else if (score >= 1) { 
                theme = { 
                    bg: "bg-blue-50", darkBg: "dark:bg-blue-900/20",
                    text: "text-blue-900", darkText: "dark:text-blue-100",
                    iconColor: "text-blue-500", iconName: "ph-activity"
                };
            } else { 
                theme = { 
                    bg: "bg-orange-50", darkBg: "dark:bg-orange-900/20",
                    text: "text-orange-900", darkText: "dark:text-orange-100",
                    iconColor: "text-orange-500", iconName: "ph-warning"
                };
            }
        } else {
            label = "Yesterday";
            theme = { 
                bg: "bg-white", darkBg: "dark:bg-gray-800",
                text: "text-gray-600", darkText: "dark:text-gray-300",
                iconColor: "text-gray-300", iconName: "ph-calendar-check"
            };
        }

        mainStatus = short;
        subStatus = desc;
        
        if (targetCheck.weight) {
            bottomContent = `<span class="text-[11px] font-bold font-mono bg-black/5 dark:bg-white/10 px-2 py-0.5 rounded">${targetCheck.weight}kg</span>`;
        } else {
            bottomContent = `<span class="text-[11px] font-semibold opacity-40">Edit</span>`;
        }
    }

    // 【修正ポイント】liverRank.js と同じクラス構成にする
    status.className = `glass-panel p-4 rounded-2xl relative overflow-hidden group cursor-pointer transition hover:border-opacity-50 flex flex-col justify-between h-full min-h-[140px] ${theme.bg} ${theme.darkBg}`;
    
    status.innerHTML = `
        <div class="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition transform group-hover:scale-110 duration-500">
            <i class="ph-fill ${theme.iconName} text-5xl ${theme.iconColor}" aria-hidden="true"></i>
        </div>
        
        <div class="relative z-10 flex flex-col h-full justify-between">
            <!-- Header Section -->
            <div>
                <div class="flex items-center gap-2 mb-1.5 h-4"> <!-- 高さ固定 -->
                    <h3 class="text-sm font-bold flex items-center gap-1.5 ${theme.text} ${theme.darkText}"><i class="ph-fill ph-clipboard-text" aria-hidden="true"></i> ${label}</h3>
                </div>
                
                <div class="flex flex-col items-start min-h-[3.5rem] justify-center"> <!-- 高さ確保 -->
                    <span class="text-3xl font-black ${theme.text} ${theme.darkText} leading-tight pb-1 tracking-tight truncate w-full">${mainStatus}</span>
                    <span class="text-xs font-bold opacity-80 ${theme.text} ${theme.darkText} -mt-1 truncate w-full">${subStatus}</span>
                </div>
            </div>

            <!-- Footer Section -->
            <div class="mt-2 flex justify-end items-end h-[34px]"> <!-- 高さをLiverRankのフッターと合わせる -->
                <div class="${theme.text} ${theme.darkText} mb-1">
                    ${bottomContent}
                </div>
            </div>
        </div>
    `;
}

function analyzeCondition(check, logs) {
    const drank = Calc.hasAlcoholLog(logs, check.timestamp);

    // 達成率ベースのスコア (drinking_only 項目を休肝日で除外)
    const ratio = Calc.calcConditionScore(check);
    // ratio を旧スコア互換の 0-4 スケールに変換
    const score = ratio !== null ? Math.round(ratio * 4) : 0;

    if (!drank && check.isDryDay) {
        if (ratio !== null && ratio >= 0.8) {
            return { short: "Perfect", desc: "休肝日・絶好調", score: 4 };
        }
        return { short: "Rest Day", desc: "休肝日", score: 3 };
    }

    // 飲酒日 or 休肝設定なしの判定
    if (score >= 3) return { short: "Good", desc: "対策バッチリ", score: 3 };
    if (score >= 1) return { short: "Average", desc: "まずまず", score: 1 };

    return { short: "Warning", desc: "不調気味", score: 0 };
}
