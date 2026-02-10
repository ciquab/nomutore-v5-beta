// @ts-check

import { db } from './store.js';
/** @typedef {import('./types.js').Log} Log */

export const LogService = {
    /**
     * 全ログ取得（日付順）
     * @returns {Promise<Log[]>}
     */
    async getAll() {
        return await db.logs.orderBy('timestamp').toArray();
    },

    /**
     * 最新のログを取得（リスト表示用）
     * @param {number} [limit=50]
     * @param {number} [offset=0]
     * @returns {Promise<Log[]>}
     */
    async getRecent(limit = 50, offset = 0) {
        return await db.logs.orderBy('timestamp').reverse().offset(offset).limit(limit).toArray();
    },

    /**
     * IDで指定してログを取得
     * @param {number} id
     * @returns {Promise<Log | undefined>}
     */
    async getById(id) {
        return await db.logs.get(id);
    },

    /**
     * タイムスタンプ範囲でログを取得（新しい順）
     * @param {number} start
     * @param {number} end
     * @returns {Promise<Log[]>}
     */
    async getByTimestampRange(start, end) {
        return await db.logs.where('timestamp').between(start, end, true, true).reverse().toArray();
    },



    /**
     * ログ件数を取得
     * @returns {Promise<number>}
     */
    async count() {
        return await db.logs.count();
    },

    /**
     * タイムスタンプ下限以上のログ件数を取得
     * @param {number} timestamp
     * @returns {Promise<number>}
     */
    async countFrom(timestamp) {
        return await db.logs.where('timestamp').aboveOrEqual(timestamp).count();
    },

    /**
     * タイムスタンプ下限以上のログを取得（新しい順）
     * @param {number} timestamp
     * @param {number} [limit=50]
     * @param {number} [offset=0]
     * @returns {Promise<Log[]>}
     */
    async getRecentFrom(timestamp, limit = 50, offset = 0) {
        return await db.logs.where('timestamp').aboveOrEqual(timestamp).reverse().offset(offset).limit(limit).toArray();
    },

    /**
     * 全ログを取得（追加順の新しい順）
     * @param {number} [limit=100]
     * @returns {Promise<Log[]>}
     */
    async getLatestByInsertOrder(limit = 100) {
        return await db.logs.toCollection().reverse().limit(limit).toArray();
    },

    /**
     * typeでログを取得
     * @param {string} type
     * @returns {Promise<Log[]>}
     */
    async getByType(type) {
        return await db.logs.where('type').equals(type).toArray();
    },

    /**
     * typeでログを取得（新しい順）
     * @param {string} type
     * @param {number} [limit=100]
     * @returns {Promise<Log[]>}
     */
    async getByTypeRecent(type, limit = 100) {
        return await db.logs.where('type').equals(type).reverse().limit(limit).toArray();
    },

    /**
     * 指定タイムスタンプ未満のログを取得
     * @param {number} timestamp
     * @returns {Promise<Log[]>}
     */
    async getBefore(timestamp) {
        return await db.logs.where('timestamp').below(timestamp).toArray();
    },

    /**
     * 指定タイムスタンプ範囲のログを取得（昇順）
     * @param {number} start
     * @param {number} end
     * @returns {Promise<Log[]>}
     */
    async getByTimestampRangeAsc(start, end) {
        return await db.logs.where('timestamp').between(start, end, true, true).toArray();
    },

    /**
     * ログを一括追加
     * @param {Log[]} logs
     * @returns {Promise<number>}
     */
    async bulkAdd(logs) {
        return await db.logs.bulkAdd(logs);
    },

    /**
     * 全ログ削除
     * @returns {Promise<void>}
     */
    async clear() {
        return await db.logs.clear();
    },
    /**
     * ログ追加
     * @param {Log} log
     * @returns {Promise<number>}
     */
    async add(log) {
        return await db.logs.add(log);
    },

    /**
     * ログ更新
     * @param {number} id
     * @param {Partial<Log>} changes
     * @returns {Promise<number>}
     */
    async update(id, changes) {
        return await db.logs.update(id, changes);
    },

    /**
     * ログ削除
     * @param {number} id
     * @returns {Promise<void>}
     */
    async delete(id) {
        return await db.logs.delete(id);
    },

    /**
     * 一括削除
     * @param {number[]} ids
     * @returns {Promise<void>}
     */
    async bulkDelete(ids) {
        return await db.logs.bulkDelete(ids);
    }
};
