// @ts-check
import { APP } from './constants.js';
import { db, Store } from './store.js';
import { Calc } from './logic.js';
import { EventBus, Events } from './eventBus.js';
import { CloudManager } from './cloudManager.js';

export const DataManager = {

// --- 共通ロジック (Internal) ---

    /**
     * バックアップ用の全データオブジェクトを生成する
     */
    getBackupObject: async () => {
        const logs = await db.logs.toArray();
        const checks = await db.checks.toArray();
        // v4で追加されたarchivesテーブルもあれば取得
        let archives = [];
        if (db.period_archives) {
            archives = await db.period_archives.toArray();
        }

        const settings = {};
        Object.values(APP.STORAGE_KEYS).forEach(key => {
            const val = localStorage.getItem(key);
            if (val !== null) settings[key] = val;
        });

        return {
            version: 4.0,
            exportedAt: Date.now(),
            data: { logs, checks, archives },
            settings: settings,
            device: navigator.userAgent
        };
    },

    /**
     * オブジェクトデータからDBを復元する
     */
    restoreFromObject: async (d, options = {}) => {
        // バージョン判定
        const isV4 = d.version && d.version >= 4.0;
        const logs = isV4 ? d.data.logs : (d.logs || []);
        const checks = isV4 ? d.data.checks : (d.checks || []);
        const archives = isV4 ? (d.data.archives || []) : [];

        // 確認はUI層から注入されたコールバックで行う（B1対応）
        if (typeof options.confirmRestore === 'function') {
            const shouldProceed = await options.confirmRestore({
                logsCount: logs.length,
                checksCount: checks.length,
                archivesCount: archives.length
            });
            if (!shouldProceed) return false;
        }

        try {
            // Logs
            if (logs.length > 0) {
                const existingLogs = await db.logs.toArray();
                // 重複排除キー: timestampとtypeの組み合わせ
                const existingLogKeys = new Set(existingLogs.map(l => `${l.timestamp}_${l.type}`));
                
                const uniqueLogs = logs
                    .filter(l => !existingLogKeys.has(`${l.timestamp}_${l.type}`))
                    .map(l => {
                        const { id, ...rest } = l; // IDを除外して新規採番
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
            
            // Archives (v4)
            if (archives.length > 0 && db.period_archives) {
                const existingArch = await db.period_archives.toArray();
                const existingArchKeys = new Set(existingArch.map(a => `${a.startDate}_${a.endDate}`));
                
                const uniqueArch = archives
                    .filter(a => !existingArchKeys.has(`${a.startDate}_${a.endDate}`))
                    .map(a => { const { id, ...rest } = a; return rest; });
                
                if (uniqueArch.length > 0) await db.period_archives.bulkAdd(uniqueArch);
            }

            // Settings
            if (isV4 && d.settings) {
                Object.entries(d.settings).forEach(([key, val]) => {
                    localStorage.setItem(key, val);
                });
            }

            localStorage.setItem(APP.STORAGE_KEYS.ONBOARDED, 'true');

            // --- 3. UIの即時反映（リロードまでの繋ぎ） ---
        // EventBus経由でUI層に通知し、テーマ再適用とモードセレクタ更新を依頼する
        const savedTheme = localStorage.getItem(APP.STORAGE_KEYS.THEME) || 'system';
        EventBus.emit(Events.STATE_CHANGE, { key: 'themeRestored', value: savedTheme });

        return true; // 成功を restoreFromCloud に返す
    } catch(err) {
        console.error(err);
        throw new Error('復元失敗');
    }
},

    // --- クラウド連携 (Google Drive) ---

    backupToCloud: async () => {
        try {
            EventBus.emit(Events.CLOUD_STATUS, { message: 'Preparing backup...' });

            // 1. データ生成
            const backupData = await DataManager.getBackupObject();

            // 2. アップロード
            EventBus.emit(Events.CLOUD_STATUS, { message: 'Uploading to Google Drive...' });
            await CloudManager.uploadBackup(backupData);

            EventBus.emit(Events.NOTIFY, { message: 'Googleドライブに保存しました', type: 'success' });
            EventBus.emit(Events.CLOUD_STATUS, { message: `Last Backup: ${new Date().toLocaleString()}` });

        } catch (err) {
            console.error(err);
            EventBus.emit(Events.NOTIFY, { message: 'バックアップ失敗: コンソールを確認してください', type: 'error' });
            EventBus.emit(Events.CLOUD_STATUS, { message: 'Error: Backup failed' });
        }
    },

    restoreFromCloud: async (options = {}) => {
        try {
            EventBus.emit(Events.CLOUD_STATUS, { message: 'Connecting to Google Drive...' });

            // 1. ダウンロード
            const data = await CloudManager.downloadBackup();
            if (!data) {
                EventBus.emit(Events.NOTIFY, { message: 'ドライブ上にバックアップが見つかりません', type: 'error' });
                EventBus.emit(Events.CLOUD_STATUS, { message: 'File not found' });
                return false;
            }

            // 2. 復元処理
            EventBus.emit(Events.CLOUD_STATUS, { message: 'Restoring data...' });
            const success = await DataManager.restoreFromObject(data, options);

            if (success) {
                EventBus.emit(Events.NOTIFY, { message: 'ドライブから復元しました', type: 'success' });
                EventBus.emit(Events.CLOUD_STATUS, { message: 'Restore Complete' });
            } else {
                EventBus.emit(Events.CLOUD_STATUS, { message: 'Restore Cancelled' });
            }
            return success;

        } catch (err) {
            console.error(err);
            EventBus.emit(Events.NOTIFY, { message: '復元失敗: コンソールを確認してください', type: 'error' });
            EventBus.emit(Events.CLOUD_STATUS, { message: 'Error: Restore failed' });
            return false;
        }
    },

    // --- 既存機能 (File/CSV) ---

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
        const backupData = await DataManager.getBackupObject();
        const jsonStr = JSON.stringify(backupData, null, 2);
        const filename = `nomutore_backup_v4_${new Date().toISOString().slice(0,10)}.json`;
        DataManager.download(jsonStr, filename, 'application/json');
    },

    /**
     * JSONインポート (v4対応)
     * onboarding.js から await できるように Promise 化
     */
    importJSON: (inputElement, options = {}) => { 
        return new Promise((resolve, reject) => {
            if (!inputElement.files.length) return resolve(false); 
            
            const f = inputElement.files[0]; 
            const r = new FileReader(); 
            
            r.onload = async (e) => { 
                try { 
                    const rawContent = e.target.result;
                    const jsonString = rawContent.charCodeAt(0) === 0xFEFF 
                        ? rawContent.slice(1) 
                        : rawContent;

                    const d = JSON.parse(jsonString); 
                    
                    // 1. 復元処理を実行（確認ダイアログが出ます）
                    const success = await DataManager.restoreFromObject(d, options);
                    
                    // 2. メッセージ通知（EventBus経由でUI層が処理）
                    if (success) {
                        EventBus.emit(Events.NOTIFY, { message: 'バックアップから復元しました', type: 'success' });

                        // メッセージを読ませてからリロード
                        setTimeout(() => window.location.reload(), 2000);
                    }

                    // 3. 呼び出し元（onboarding.js等）に結果を返す
                    resolve(success);
                } catch(err) {
                    console.error(err);
                    EventBus.emit(Events.NOTIFY, { message: '読込失敗: データ形式が不正です', type: 'error' });
                    reject(err); 
                } 
                inputElement.value = ''; 
            }; 
            r.onerror = () => reject(new Error('File reading failed'));
            r.readAsText(f); 
        });
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