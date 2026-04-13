'use client';

// ==================== CloudBase 同步层 ====================
// 本地优先 + 云端智能同步
// 数据变化时启动同步，5分钟无变化后停止定时器，直到下次变化

import { isCloudBaseConfigured, getCloudBase } from './cloudbase';
import { getCurrentUser } from './auth';

// ==================== 配置 ====================

const SYNC_INTERVAL = 5 * 60 * 1000; // 5 分钟
const IDLE_TIMEOUT = 5 * 60 * 1000;  // 5 分钟无变化后停止自动同步
const COLLECTION_NAME = 'author-sync';
const CONCURRENT_LIMIT = 20;          // 并发写入上限

// ==================== 同步队列 ====================

const _pendingWrites = new Map();    // key → { value, timestamp }
let _syncTimer = null;
let _isSyncing = false;
let _idleTimer = null;               // 空闲检测定时器
let _lastDataChange = 0;             // 最后一次数据变化时间
let _firstSyncAfterLogin = true;     // 登录后第一次同步标志

// 同步状态回调
let _syncStatusCallback = null;
export function onSyncStatusChange(callback) {
    _syncStatusCallback = callback;
}

function notifySyncStatus(status) {
    if (_syncStatusCallback) {
        _syncStatusCallback({
            ...status,
            keys: Array.from(_pendingWrites.keys())
        });
    }
}

// ==================== 工具函数 ====================

// 生成文档 ID：uid:key
function docId(uid, key) {
    return `${uid}:${key}`;
}

// 深度清理 undefined 值（CloudBase 不接受 undefined）
function deepClean(obj) {
    if (obj === undefined) return null;
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(deepClean);
    const cleanObj = {};
    for (const k in obj) {
        const v = deepClean(obj[k]);
        if (v !== undefined) cleanObj[k] = v;
    }
    return cleanObj;
}

// 限制并发数的 Promise.all
async function parallelLimit(tasks, limit) {
    const results = [];
    let index = 0;
    async function next() {
        const i = index++;
        if (i >= tasks.length) return;
        results[i] = await tasks[i]();
        await next();
    }
    await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, () => next()));
    return results;
}

// ==================== 读写接口 ====================

/**
 * 从 CloudBase 读取数据
 * @param {string} key - 存储键名
 * @returns {Promise<any>} 数据值，不存在返回 undefined
 */
export async function firestoreGet(key) {
    const user = getCurrentUser();
    if (!isCloudBaseConfigured || !user) return undefined;
    const { db } = await getCloudBase();
    if (!db) return undefined;

    try {
        const col = db.collection(COLLECTION_NAME);
        const res = await col.where({ uid: user.uid, key }).limit(1).get();
        if (res.data && res.data.length > 0) {
            return res.data[0].value;
        }
        return undefined;
    } catch (err) {
        console.warn('[cloudbase] GET failed:', key, err.message);
        return undefined;
    }
}

/**
 * 将数据加入同步队列（不立即写入）
 * @param {string} key - 存储键名
 * @param {any} value - 要存储的值
 */
export function firestoreEnqueue(key, value) {
    const user = getCurrentUser();
    if (!isCloudBaseConfigured || !user) return;

    _pendingWrites.set(key, { value, timestamp: Date.now() });
    _lastDataChange = Date.now();
    notifySyncStatus({ pending: _pendingWrites.size });

    ensureSyncTimer();
    resetIdleTimer();
}

function ensureSyncTimer() {
    if (!_syncTimer) {
        _syncTimer = setInterval(flushSync, SYNC_INTERVAL);
        console.log('[cloudbase] sync timer started');
    }
}

function clearSyncTimer() {
    if (_syncTimer) {
        clearInterval(_syncTimer);
        _syncTimer = null;
        console.log('[cloudbase] sync timer stopped (idle)');
    }
}

function resetIdleTimer() {
    if (_idleTimer) clearTimeout(_idleTimer);
    _idleTimer = setTimeout(() => {
        flushSync().then(() => {
            clearSyncTimer();
            notifySyncStatus({
                syncing: false,
                pending: 0,
                lastSync: Date.now(),
                idle: true,
            });
            console.log('[cloudbase] auto-sync paused: no data changes for 5 minutes');
        });
    }, IDLE_TIMEOUT);
}

/**
 * 立即从 CloudBase 删除数据
 * @param {string} key - 存储键名
 */
export async function firestoreDel(key) {
    const user = getCurrentUser();
    if (!isCloudBaseConfigured || !user) return;

    _pendingWrites.set(key, { value: '_AUTHOR_DELETE_' });

    if (!_isSyncing && !_syncTimer) {
        ensureSyncTimer();
    }
    resetIdleTimer();
}

// ==================== 批量同步 ====================

/**
 * 将队列中的数据批量写入 CloudBase
 */
export async function flushSync() {
    const user = getCurrentUser();
    if (!isCloudBaseConfigured || !user) return;

    // 登录后第一次同步 — 强制执行
    if (_firstSyncAfterLogin) {
        _firstSyncAfterLogin = false;
        if (_pendingWrites.size === 0) {
            notifySyncStatus({ syncing: true, pending: 0 });
            await new Promise(r => setTimeout(r, 800));
            notifySyncStatus({ syncing: false, pending: 0, lastSync: Date.now() });
            return;
        }
    } else if (_pendingWrites.size === 0) {
        notifySyncStatus({ syncing: false, pending: 0, lastSync: Date.now() });
        return;
    }
    if (_isSyncing) return;

    _isSyncing = true;
    notifySyncStatus({ syncing: true, pending: _pendingWrites.size });

    const entries = Array.from(_pendingWrites.entries());
    _pendingWrites.clear();

    try {
        const { db } = await getCloudBase();
        if (!db) return;
        const col = db.collection(COLLECTION_NAME);
        const tasks = entries.map(([key, { value }]) => async () => {
            if (value === '_AUTHOR_DELETE_') {
                // 查找并删除
                const existing = await col.where({ uid: user.uid, key }).limit(1).get();
                if (existing.data && existing.data.length > 0) {
                    await col.doc(existing.data[0]._id).remove();
                }
                return;
            }

            const cleanValue = deepClean(value);
            const payload = {
                uid: user.uid,
                key,
                value: cleanValue,
                updatedAt: db.serverDate(),
            };

            // Upsert: 查找已有文档，存在则更新，不存在则创建
            const existing = await col.where({ uid: user.uid, key }).limit(1).get();
            if (existing.data && existing.data.length > 0) {
                await col.doc(existing.data[0]._id).update(payload);
            } else {
                await col.add(payload);
            }
        });

        await parallelLimit(tasks, CONCURRENT_LIMIT);

        console.log(`[cloudbase] synced ${entries.length} items`);
        notifySyncStatus({ syncing: false, pending: 0, lastSync: Date.now() });
    } catch (err) {
        console.error('[cloudbase] sync failed:', err.message);
        // 失败的写回队列
        for (const [key, data] of entries) {
            if (!_pendingWrites.has(key)) {
                _pendingWrites.set(key, data);
            }
        }
        notifySyncStatus({ syncing: false, pending: _pendingWrites.size, error: err.message });
    } finally {
        _isSyncing = false;
    }
}

/**
 * 首次登录时，从 CloudBase 拉取全部数据并合并到本地
 * @param {Function} localGet - 本地读取函数 (key) => value
 * @param {Function} localSet - 本地写入函数 (key, value) => void
 * @returns {Promise<number>} 合并的数据条数
 */
export async function pullAllFromCloud(localGet, localSet) {
    const user = getCurrentUser();
    if (!isCloudBaseConfigured || !user) return 0;

    try {
        const { db } = await getCloudBase();
        if (!db) return 0;
        const col = db.collection(COLLECTION_NAME);
        // CloudBase 单次最多 1000 条，分页拉取
        let allDocs = [];
        let offset = 0;
        const PAGE_SIZE = 1000;
        while (true) {
            const res = await col.where({ uid: user.uid }).skip(offset).limit(PAGE_SIZE).get();
            if (!res.data || res.data.length === 0) break;
            allDocs = allDocs.concat(res.data);
            if (res.data.length < PAGE_SIZE) break;
            offset += PAGE_SIZE;
        }

        let merged = 0;
        for (const doc of allDocs) {
            const key = doc.key;
            const cloudValue = doc.value;
            const localData = await localGet(key);

            const isLocalEmptyOrDefault = (key, data) => {
                if (data === undefined || data === null) return true;
                if (Array.isArray(data)) {
                    if (data.length === 0) return true;
                    if (key.startsWith('author-chapters')) {
                        const hasContent = data.some(item =>
                            item.type !== 'volume' &&
                            ((item.content && item.content.trim() !== '') || (item.wordCount > 0) || (item.title && item.title !== '未命名章节'))
                        );
                        return !hasContent;
                    }
                    if (key.startsWith('author-settings-nodes')) {
                        const hasItems = data.some(item => item.type === 'item');
                        const hasSpecialContent = data.some(node =>
                            node.type === 'special' &&
                            (node.content?.title || node.content?.synopsis)
                        );
                        return !hasItems && !hasSpecialContent;
                    }
                    if (key === 'author-works-index') {
                        if (data.length === 1 && data[0].id === 'work-default' && data[0].name === '默认作品') {
                            return true;
                        }
                    }
                    return false;
                }
                if (typeof data === 'object') {
                    if (Object.keys(data).length === 0) return true;
                }
                if (typeof data === 'string' && data.trim() === '') return true;
                return false;
            };

            if (isLocalEmptyOrDefault(key, localData)) {
                await localSet(key, cloudValue);
                merged++;
            } else if (Array.isArray(localData) && Array.isArray(cloudValue)) {
                let isIdBased = false;
                const localMap = new Map();
                for (const item of localData) {
                    if (item && item.id) {
                        isIdBased = true;
                        localMap.set(item.id, { ...item });
                    }
                }

                if (isIdBased) {
                    let hasDeltas = false;
                    for (const item of cloudValue) {
                        if (item && item.id) {
                            const localItem = localMap.get(item.id);
                            if (!localItem) {
                                localMap.set(item.id, { ...item });
                                hasDeltas = true;
                            } else {
                                const localTime = new Date(localItem.updatedAt || 0).getTime();
                                const cloudTime = new Date(item.updatedAt || 0).getTime();
                                if (cloudTime > localTime) {
                                    localMap.set(item.id, { ...item });
                                    hasDeltas = true;
                                }
                            }
                        }
                    }
                    if (hasDeltas) {
                        await localSet(key, Array.from(localMap.values()));
                        merged++;
                    }
                }
            }
        }

        console.log(`[cloudbase] pulled ${allDocs.length} items, merged ${merged}`);
        return merged;
    } catch (err) {
        console.warn('[cloudbase] pull failed:', err.message);
        return 0;
    }
}

/**
 * 强制从云端拉取全部数据，无视本地状态直接覆盖
 * @param {Function} localSet - 本地写入函数
 * @returns {Promise<number>} 覆盖的数据条数
 */
export async function forcePullFromCloud(localSet) {
    const user = getCurrentUser();
    if (!isCloudBaseConfigured || !user) return 0;

    notifySyncStatus({ syncing: true, pending: 0 });
    try {
        const { db } = await getCloudBase();
        if (!db) return 0;
        const col = db.collection(COLLECTION_NAME);
        let allDocs = [];
        let offset = 0;
        const PAGE_SIZE = 1000;
        while (true) {
            const res = await col.where({ uid: user.uid }).skip(offset).limit(PAGE_SIZE).get();
            if (!res.data || res.data.length === 0) break;
            allDocs = allDocs.concat(res.data);
            if (res.data.length < PAGE_SIZE) break;
            offset += PAGE_SIZE;
        }

        let pulledCount = 0;
        for (const doc of allDocs) {
            const key = doc.key;
            const cloudValue = doc.value;

            if (cloudValue !== undefined) {
                if (key.startsWith('author-settings-nodes')) {
                    if (Array.isArray(cloudValue)) {
                        const brokenItems = cloudValue.filter(n => n.type === 'item' && !n.parentId);
                        if (brokenItems.length > 0) {
                            console.warn(`[cloudbase] ⚠️ 发现 ${brokenItems.length} 个缺失 parentId 的游离设定条目`);
                        }
                    }
                } else if (key.startsWith('author-chapters')) {
                    if (!Array.isArray(cloudValue) || cloudValue.length === 0) {
                        console.warn(`[cloudbase] ⚠️ 拉取到空章节数据:`, key);
                    }
                }

                await localSet(key, cloudValue);
                pulledCount++;
            }
        }

        console.log(`[cloudbase] force pulled ${allDocs.length} items, overwritten ${pulledCount} local items`);
        notifySyncStatus({ syncing: false, pending: 0, lastSync: Date.now() });
        return pulledCount;
    } catch (err) {
        console.error('[cloudbase] force pull failed:', err.message);
        notifySyncStatus({ syncing: false, pending: 0, error: err.message });
        throw err;
    }
}

// ==================== 清理 ====================

export function stopSync() {
    clearSyncTimer();
    if (_idleTimer) {
        clearTimeout(_idleTimer);
        _idleTimer = null;
    }
    _pendingWrites.clear();
    _firstSyncAfterLogin = true;
    notifySyncStatus({ pending: 0, syncing: false });
}

export function setupBeforeUnloadSync() {
    if (typeof window === 'undefined') return;
    window.addEventListener('beforeunload', () => {
        if (_pendingWrites.size > 0) {
            flushSync().catch(() => {});
        }
    });
}
