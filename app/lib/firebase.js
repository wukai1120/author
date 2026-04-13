'use client';

// ==================== 兼容层 ====================
// 原 Firebase 初始化文件，现在从 CloudBase 模块 re-export

export {
    isCloudBaseConfigured as isFirebaseConfigured,
    isCloudBaseConfigured,
    getCloudBase,
    getApp,
    getAuth,
    getDb,
} from './cloudbase';
