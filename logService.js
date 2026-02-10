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
