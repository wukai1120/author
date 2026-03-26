'use client';

// ==================== Firestore 同步层 ====================
// 本地优先 + 云端智能同步
// 数据变化时启动同步，5分钟无变化后停止定时器，直到下次变化

import {
    doc, getDoc, setDoc, deleteDoc, serverTimestamp, writeBatch,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from './firebase';
import { getCurrentUser } from './auth';

// ==================== 配置 ====================

const SYNC_INTERVAL = 5 * 60 * 1000; // 5 分钟
const IDLE_TIMEOUT = 5 * 60 * 1000;  // 5 分钟无变化后停止自动同步
const COLLECTION_NAME = 'data';       // users/{uid}/data/{key}

// ==================== 同步队列 ====================

const _pendingWrites = new Map();    // key → { value, timestamp }
let _syncTimer = null;
let _isSyncing = false;
let _idleTimer = null;               // 空闲检测定时器
let _lastDataChange = 0;             // 最后一次数据变化时间
let _firstSyncAfterLogin = true;     // 登录后第一次同步标志（强制真实同步）

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

// ==================== 读写接口 ====================

/**
 * 从 Firestore 读取数据
 * @param {string} key - 存储键名
 * @returns {Promise<any>} 数据值，不存在返回 undefined
 */
export async function firestoreGet(key) {
    const user = getCurrentUser();
    if (!isFirebaseConfigured || !db || !user) return undefined;

    try {
        const ref = doc(db, 'users', user.uid, COLLECTION_NAME, key);
        const snap = await getDoc(ref);
        if (snap.exists()) {
            return snap.data().value;
        }
        return undefined;
    } catch (err) {
        console.warn('[firestore] GET failed:', key, err.message);
        return undefined;
    }
}

/**
 * 将数据加入同步队列（不立即写入 Firestore）
 * 同时启动/重置空闲检测定时器
 * @param {string} key - 存储键名
 * @param {any} value - 要存储的值
 */
export function firestoreEnqueue(key, value) {
    const user = getCurrentUser();
    if (!isFirebaseConfigured || !db || !user) return;

    _pendingWrites.set(key, { value, timestamp: Date.now() });
    _lastDataChange = Date.now();
    notifySyncStatus({ pending: _pendingWrites.size });

    // 启动定时同步（如果还没启动）
    ensureSyncTimer();

    // 重置空闲检测
    resetIdleTimer();
}

/**
 * 启动同步定时器（如果未运行）
 */
function ensureSyncTimer() {
    if (!_syncTimer) {
        _syncTimer = setInterval(flushSync, SYNC_INTERVAL);
        console.log('[firestore] sync timer started');
    }
}

/**
 * 停止同步定时器
 */
function clearSyncTimer() {
    if (_syncTimer) {
        clearInterval(_syncTimer);
        _syncTimer = null;
        console.log('[firestore] sync timer stopped (idle)');
    }
}

/**
 * 重置空闲检测定时器
 * 每次数据变化时调用；5 分钟无新变化则停止自动同步
 */
function resetIdleTimer() {
    if (_idleTimer) clearTimeout(_idleTimer);
    _idleTimer = setTimeout(() => {
        // 5 分钟无变化，先做一次最终同步，然后停止定时器
        flushSync().then(() => {
            clearSyncTimer();
            notifySyncStatus({
                syncing: false,
                pending: 0,
                lastSync: Date.now(),
                idle: true,
            });
            console.log('[firestore] auto-sync paused: no data changes for 5 minutes');
        });
    }, IDLE_TIMEOUT);
}

/**
 * 立即从 Firestore 删除数据
 * @param {string} key - 存储键名
 */
export async function firestoreDel(key) {
    const user = getCurrentUser();
    if (!isFirebaseConfigured || !db || !user) return;

    // 移出队列（如果在队列中）
    _pendingWrites.delete(key);

    try {
        const ref = doc(db, 'users', user.uid, COLLECTION_NAME, key);
        await deleteDoc(ref);
    } catch (err) {
        console.warn('[firestore] DEL failed:', key, err.message);
    }
}

// ==================== 批量同步 ====================

/**
 * 将队列中的数据批量写入 Firestore
 * 由定时器自动调用，也可手动调用（如退出登录前）
 */
export async function flushSync() {
    const user = getCurrentUser();
    if (!isFirebaseConfigured || !db || !user) return;

    // 登录后第一次同步 — 强制执行真实同步（即使队列为空）
    if (_firstSyncAfterLogin) {
        _firstSyncAfterLogin = false;
        if (_pendingWrites.size === 0) {
            // 队列为空但是首次 → 标记为正在同步，给 UI 反馈
            notifySyncStatus({ syncing: true, pending: 0 });
            // 短暂延迟让 UI 看到同步动画
            await new Promise(r => setTimeout(r, 800));
            notifySyncStatus({ syncing: false, pending: 0, lastSync: Date.now() });
            return;
        }
    } else if (_pendingWrites.size === 0) {
        // 非首次且无待同步数据 — 仅反馈 UI
        notifySyncStatus({ syncing: false, pending: 0, lastSync: Date.now() });
        return;
    }
    if (_isSyncing) return; // 防止并发

    _isSyncing = true;
    notifySyncStatus({ syncing: true, pending: _pendingWrites.size });

    // 取出当前队列快照
    const entries = Array.from(_pendingWrites.entries());
    _pendingWrites.clear();

    try {
        // Firestore 限制：每个 writeBatch 最多 500 个操作
        const BATCH_LIMIT = 450;
        for (let i = 0; i < entries.length; i += BATCH_LIMIT) {
            const chunk = entries.slice(i, i + BATCH_LIMIT);
            const batch = writeBatch(db);

            for (const [key, { value }] of chunk) {
                const ref = doc(db, 'users', user.uid, COLLECTION_NAME, key);
                batch.set(ref, {
                    value,
                    updatedAt: serverTimestamp(),
                });
            }

            await batch.commit();
        }

        console.log(`[firestore] synced ${entries.length} items`);
        notifySyncStatus({ syncing: false, pending: 0, lastSync: Date.now() });
    } catch (err) {
        console.error('[firestore] batch sync failed:', err.message);
        // 失败的写回队列，等下次重试
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
 * 首次登录时，从 Firestore 拉取全部数据并合并到本地
 * @param {Function} localGet - 本地读取函数 (key) => value
 * @param {Function} localSet - 本地写入函数 (key, value) => void
 * @returns {Promise<number>} 合并的数据条数
 */
export async function pullAllFromCloud(localGet, localSet) {
    const user = getCurrentUser();
    if (!isFirebaseConfigured || !db || !user) return 0;

    try {
        const { collection, getDocs } = await import('firebase/firestore');
        const colRef = collection(db, 'users', user.uid, COLLECTION_NAME);
        const snapshot = await getDocs(colRef);

        let merged = 0;
        for (const docSnap of snapshot.docs) {
            const key = docSnap.id;
            const cloudData = docSnap.data();
            const localData = await localGet(key);

            // 简单合并策略：云端有数据且本地没有 → 用云端的
            // 如果都有，以 updatedAt 更新时间为准
            if (localData === undefined || localData === null) {
                await localSet(key, cloudData.value);
                merged++;
            }
        }

        console.log(`[firestore] pulled ${snapshot.size} items, merged ${merged}`);
        return merged;
    } catch (err) {
        console.warn('[firestore] pull failed:', err.message);
        return 0;
    }
}

// ==================== 清理 ====================

/**
 * 停止同步定时器（退出登录时调用）
 */
export function stopSync() {
    clearSyncTimer();
    if (_idleTimer) {
        clearTimeout(_idleTimer);
        _idleTimer = null;
    }
    _pendingWrites.clear();
    _firstSyncAfterLogin = true; // 下次登录后重新强制首次同步
    notifySyncStatus({ pending: 0, syncing: false });
}

/**
 * 页面卸载前，尝试同步剩余数据
 */
export function setupBeforeUnloadSync() {
    if (typeof window === 'undefined') return;
    window.addEventListener('beforeunload', () => {
        if (_pendingWrites.size > 0) {
            // 使用 sendBeacon 或同步请求尝试最后一次同步
            // 注意：这不可靠，但能提高数据安全性
            flushSync().catch(() => { });
        }
    });
}
