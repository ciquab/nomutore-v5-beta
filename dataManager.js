import { APP } from './constants.js';
import { db, Store } from './store.js';
import { Calc } from './logic.js';
import { UI, updateBeerSelectOptions, refreshUI } from './ui/index.js';

export const DataManager = {
    /**
     * CSVエクスポート
     * @param {string} type - 'logs' | 'checks'
     */
    exportCSV: async (type) => { 
        let data = [], content = "", filename = ""; 
        const escapeCSV = (s) => `"${String(s).replace(/"/g,'""')}"`; 
        
        if(type === 'logs'){ 
            data = await db.logs.toArray();
            data.sort((a,b) => a.timestamp - b.timestamp);
            
            const profile = Store.getProfile();

            content = "日時,内容,カロリー(kcal),換算分(ステッパー),実運動時間(分),ブルワリー,銘柄,評価,メモ\n" + 
                data.map(r => {
                    const rawMin = r.rawMinutes !== undefined ? r.rawMinutes : '-';
                    // kcalがない場合は補完
                    const kcal = r.kcal !== undefined ? Math.round(r.kcal) : Math.round(r.minutes * Calc.burnRate(6.0, profile));
                    return `${new Date(r.timestamp).toLocaleString()},${escapeCSV(r.name)},${kcal},${r.minutes},${rawMin},${escapeCSV(r.brewery||'')},${escapeCSV(r.brand||'')},${r.rating||''},${escapeCSV(r.memo||'')}`;
                }).join("\n");
            filename = `nomutore_logs_${new Date().toISOString().slice(0,10)}.csv`;
        } else if (type === 'checks') {
            data = await db.checks.toArray();
            data.sort((a,b) => a.timestamp - b.timestamp);
            content = "日時,休肝日,腹囲,足軽,水分,食物繊維,体重\n" + 
                data.map(r => `${new Date(r.timestamp).toLocaleString()},${r.isDryDay},${r.waistEase},${r.footLightness},${r.waterOk},${r.fiberOk},${r.weight||''}`).join("\n");
            filename = `nomutore_checks_${new Date().toISOString().slice(0,10)}.csv`;
        }
        
        DataManager.download(content, filename, 'text/csv');
    },

    /**
     * 【改修】JSONバックアップ (Full Dump)
     * v4対応: logs, checks, period_archives, settings を全て出力
     */
    exportJSON: async () => {
        const logs = await db.logs.toArray();
        const checks = await db.checks.toArray();
        const archives = await db.period_archives.toArray(); // 新テーブル

        // LocalStorageから設定値を収集
        const settings = {};
        Object.values(APP.STORAGE_KEYS).forEach(key => {
            const val = localStorage.getItem(key);
            if (val !== null) settings[key] = val;
        });

        const backupData = {
            version: 4.0,
            exportedAt: Date.now(),
            data: {
                logs,
                checks,
                archives
            },
            settings: settings
        };

        const jsonStr = JSON.stringify(backupData, null, 2);
        const filename = `nomutore_backup_v4_${new Date().toISOString().slice(0,10)}.json`;
        DataManager.download(jsonStr, filename, 'application/json');
    },

    /**
     * JSONインポート (v4対応版はPhase 4で実装予定、現在はv3互換維持)
     * ※現状はlogs/checksのみ復元
     */
    importJSON: (inputElement) => { 
        if (!inputElement.files.length) return; 
        const f = inputElement.files[0]; 
        const r = new FileReader(); 
        r.onload = async (e) => { 
            try { 
                const d = JSON.parse(e.target.result); 
                
                // v4フォーマットかどうか判定
                const isV4 = d.version && d.version >= 4.0;
                const logs = isV4 ? d.data.logs : (d.logs || []);
                const checks = isV4 ? d.data.checks : (d.checks || []);
                // const archives = isV4 ? d.data.archives : []; // ※復元ロジックは別途必要

                if (confirm(`ログ ${logs.length}件、チェック ${checks.length}件を復元しますか？\n(既存データと重複するものはスキップされます)`)) { 
                    
                    // Logs
                    if (logs.length > 0) {
                        const existingLogs = await db.logs.toArray();
                        const existingLogKeys = new Set(existingLogs.map(l => `${l.timestamp}_${l.type}`));
                        
                        const uniqueLogs = logs
                            .filter(l => !existingLogKeys.has(`${l.timestamp}_${l.type}`))
                            .map(l => {
                                const { id, ...rest } = l; // IDは除外して新規採番
                                return rest;
                            });
                            
                        if (uniqueLogs.length > 0) {
                            await db.logs.bulkAdd(uniqueLogs);
                        }
                    }

                    // Checks
                    if (checks.length > 0) {
                        const existingChecks = await db.checks.toArray();
                        const existingCheckTimestamps = new Set(existingChecks.map(c => c.timestamp));
                        
                        const uniqueChecks = checks
                            .filter(c => !existingCheckTimestamps.has(c.timestamp))
                            .map(c => {
                                const { id, ...rest } = c;
                                return rest;
                            });
                        if (uniqueChecks.length > 0) {
                            await db.checks.bulkAdd(uniqueChecks);
                        }
                    }
                    
                    // Settings (v4バックアップからの復元)
                    if (isV4 && d.settings) {
                        Object.entries(d.settings).forEach(([key, val]) => {
                            localStorage.setItem(key, val);
                        });
                    }

                    // UI更新
                    UI.updateModeSelector();
                    updateBeerSelectOptions(); 
                    UI.applyTheme(localStorage.getItem(APP.STORAGE_KEYS.THEME) || 'system');
                    await refreshUI(); 
                    
                    UI.showMessage('復元しました','success'); 
                } 
            } catch(err) { 
                console.error(err);
                UI.showMessage('読込失敗: データ形式が不正です','error'); 
            } 
            inputElement.value = ''; 
        }; 
        r.readAsText(f); 
    },

    download: (data, filename, type) => { 
        const blob = new Blob([new Uint8Array([0xEF,0xBB,0xBF]), data], {type: type});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); 
        a.href = url; 
        a.download = filename; 
        a.click();
        setTimeout(() => { URL.revokeObjectURL(url); }, 100); 
    }
};