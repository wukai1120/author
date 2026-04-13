'use client';

// ==================== 兼容层 ====================
// 原 Firestore 同步文件，现在从 CloudBase 同步模块 re-export

export {
    firestoreGet,
    firestoreEnqueue,
    firestoreDel,
    flushSync,
    pullAllFromCloud,
    forcePullFromCloud,
    stopSync,
    setupBeforeUnloadSync,
    onSyncStatusChange,
} from './cloudbase-sync';
