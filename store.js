// @ts-check
import { APP } from './constants.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

// DexieはHTMLで読み込んでいるため window.Dexie として存在します
export const db = new Dexie("NomutoreDB");

// 過去のバージョン履歴
db.version(1).stores({
    logs: '++id, timestamp, type, name, kcal',
    checks: '++id, timestamp'
});

db.version(2).stores({
    logs: '++id, timestamp, type, name, kcal',
    checks: '++id, timestamp'
});

db.version(3).stores({
    logs: '++id, timestamp, type, name, kcal, memo, untappd_query',
    checks: '++id, timestamp',
    period_archives: '++id, startDate, endDate, mode'
});

// ★追加: v4用定義 (archivesテーブルを追加)
db.version(4).stores({
    logs: '++id, timestamp, type, name, kcal, memo, untappd_query, isCustom, exerciseKey',
    checks: '++id, timestamp, isDryDay',
    period_archives: '++id, startDate, endDate, mode, totalDays, dryDays' // period_archives -> archives
}).upgrade(tx => {
    // v3の period_archives データがあれば archives に移行（必要なら）
    // 今回は全削除前提ならスキーマ定義だけでOKですが、念のため構造を整えます
});

// ★追加: v5用定義 (味わいレーダーチャート機能: flavorProfile フィールド追加)
// flavorProfile はJSONオブジェクトとして格納（インデックス不要、Phase 1では検索対象外）
// スキーマのインデックス定義は v4 と同一（flavorProfile はインデックス不要のため列挙しない）
db.version(5).stores({
    logs: '++id, timestamp, type, name, kcal, memo, untappd_query, isCustom, exerciseKey',
    checks: '++id, timestamp, isDryDay',
    period_archives: '++id, startDate, endDate, mode, totalDays, dryDays'
});

const LAST_ACTIVE_KEY = 'nomutore_last_active_date';

export const Store = {
    // --- ライフサイクル状態 ---
    getLastActiveDate: () => localStorage.getItem(LAST_ACTIVE_KEY),
    setLastActiveDate: (date) => localStorage.setItem(LAST_ACTIVE_KEY, date),

    getProfile: () => ({
        weight: parseFloat(localStorage.getItem(APP.STORAGE_KEYS.WEIGHT)) || APP.DEFAULTS.WEIGHT,
        height: parseFloat(localStorage.getItem(APP.STORAGE_KEYS.HEIGHT)) || APP.DEFAULTS.HEIGHT,
        age: parseInt(localStorage.getItem(APP.STORAGE_KEYS.AGE)) || APP.DEFAULTS.AGE,
        gender: localStorage.getItem(APP.STORAGE_KEYS.GENDER) || APP.DEFAULTS.GENDER
    }),
    getModes: () => ({
        mode1: localStorage.getItem(APP.STORAGE_KEYS.MODE1) || APP.DEFAULTS.MODE1,
        mode2: localStorage.getItem(APP.STORAGE_KEYS.MODE2) || APP.DEFAULTS.MODE2
    }),
    getBaseExercise: () => localStorage.getItem(APP.STORAGE_KEYS.BASE_EXERCISE) || APP.DEFAULTS.BASE_EXERCISE,
    getTheme: () => localStorage.getItem(APP.STORAGE_KEYS.THEME) || APP.DEFAULTS.THEME,
    getDefaultRecordExercise: () => localStorage.getItem(APP.STORAGE_KEYS.DEFAULT_RECORD_EXERCISE) || APP.DEFAULTS.DEFAULT_RECORD_EXERCISE,

    // 最後に取得したデータを一時的に保持しておくための簡易キャッシュ
    _cachedData: { logs: [], checks: [], periodLogs: [] },
    
    setCachedData: (logs, checks, periodLogs) => {
        // periodLogsがない場合はlogs(全期間)で代用
        Store._cachedData = { logs, checks, periodLogs: periodLogs || logs };
    },
    
    getCachedData: () => {
        const d = Store._cachedData;
        return { logs: [...d.logs], checks: [...d.checks], periodLogs: [...d.periodLogs] };
    },

    clearCachedData: () => {
        Store._cachedData = { logs: [], checks: [], periodLogs: [] };
    },

    migrateV3ToV4: async () => {
        if (localStorage.getItem('v4_migration_complete')) {
            return false;
        }

        console.log('[Migration] Starting v3 to v4 migration...');

        if (!localStorage.getItem(APP.STORAGE_KEYS.PERIOD_MODE)) {
            localStorage.setItem(APP.STORAGE_KEYS.PERIOD_MODE, APP.DEFAULTS.PERIOD_MODE);
        }

        if (!localStorage.getItem(APP.STORAGE_KEYS.PERIOD_START)) {
            const now = dayjs();
            const day = now.day() || 7;
            const startOfWeek = now.subtract(day - 1, 'day').startOf('day').valueOf();

            localStorage.setItem(APP.STORAGE_KEYS.PERIOD_START, startOfWeek);
        }

        if (!localStorage.getItem(APP.STORAGE_KEYS.UNIT_MODE)) {
            localStorage.setItem(APP.STORAGE_KEYS.UNIT_MODE, APP.DEFAULTS.UNIT_MODE);
        }

        if (!localStorage.getItem(APP.STORAGE_KEYS.ORB_STYLE)) {
            localStorage.setItem(APP.STORAGE_KEYS.ORB_STYLE, APP.DEFAULTS.ORB_STYLE);
        }

        localStorage.setItem('v4_migration_complete', 'true');
        console.log('[Migration] v4 migration completed successfully.');

        return true;
    },

    /**
     * B4対策: v3時代のchecksレコードに isDryDay フィールドをバックフィルする。
     * Dexie の upgrade() は既にv5に進んだユーザーには効かないため、
     * 起動時にランタイムで未設定レコードを修正する（1回限りフラグ付き）。
     */
    ensureFieldDefaults: async () => {
        if (localStorage.getItem('v5_field_defaults_applied')) {
            return false;
        }

        try {
            const checks = await db.checks.toArray();
            const needsFix = checks.filter(c => c.isDryDay === undefined);

            if (needsFix.length > 0) {
                await db.transaction('rw', db.checks, async () => {
                    for (const check of needsFix) {
                        await db.checks.update(check.id, { isDryDay: false });
                    }
                });
                console.log(`[B4] Backfilled isDryDay on ${needsFix.length} checks records.`);
            }

            localStorage.setItem('v5_field_defaults_applied', 'true');
            return needsFix.length > 0;
        } catch (e) {
            console.error('[B4] ensureFieldDefaults failed:', e);
            return false;
        }
    },

    /**
     * B3対策: IndexedDB と localStorage のマイグレーションフラグの整合性を検証する。
     *
     * シナリオA: IDB手動クリア → DB空だがフラグ残存 → フラグ削除して再マイグレーション
     * シナリオB: localStorage手動クリア → フラグ消失 → DBにデータがあれば
     *           マイグレーション不要なのでフラグだけ復元（PERIOD_START上書きを防止）
     */
    ensureStorageIntegrity: async () => {
        try {
            const migrationFlag = localStorage.getItem('v4_migration_complete');
            const hasDbData = (await db.logs.count()) > 0 || (await db.checks.count()) > 0;

            if (migrationFlag && !hasDbData) {
                // シナリオA: フラグはあるがDBが空 → フラグを消してマイグレーション再実行を許可
                localStorage.removeItem('v4_migration_complete');
                localStorage.removeItem('v5_field_defaults_applied');
                console.log('[B3] DB is empty but migration flag exists. Cleared flag for re-migration.');
                return 'flag_cleared';
            }

            if (!migrationFlag && hasDbData) {
                // シナリオB: DBにデータがあるがフラグが消えている → フラグだけ復元
                // migrateV3ToV4 が再実行されると PERIOD_START を上書きしてしまうのを防ぐ
                localStorage.setItem('v4_migration_complete', 'true');
                console.log('[B3] DB has data but migration flag missing. Restored flag to prevent re-migration.');
                return 'flag_restored';
            }

            return 'ok';
        } catch (e) {
            console.error('[B3] ensureStorageIntegrity failed:', e);
            return 'error';
        }
    }
};

export const ExternalApp = {
    searchUntappd: (term) => {
        const query = encodeURIComponent(term);
        const webUrl = `https://untappd.com/search?q=${query}`;
        window.open(webUrl, '_blank');
    }
};