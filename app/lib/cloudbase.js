'use client';

// ==================== CloudBase 初始化 ====================
// 使用环境变量配置，替代原 Firebase 初始化
// 注意：@cloudbase/js-sdk 包含 Node.js 适配器代码，
// 不能在 SSR 阶段 import，需要用动态 import 延迟加载

const cloudbaseConfig = {
    env: process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID,
    region: process.env.NEXT_PUBLIC_CLOUDBASE_REGION || 'ap-shanghai',
    accessKey: process.env.NEXT_PUBLIC_CLOUDBASE_ACCESS_KEY,
};

// CloudBase 是否已配置（用户/开发者是否填好了环境变量）
export const isCloudBaseConfigured = Boolean(cloudbaseConfig.env && cloudbaseConfig.accessKey);

let _app = null;
let _auth = null;
let _db = null;
let _initPromise = null;

/**
 * 懒初始化 CloudBase SDK（仅客户端）
 * 首次调用时动态 import SDK 并初始化，后续直接返回缓存
 */
async function initSDK() {
    if (_app) return { app: _app, auth: _auth, db: _db };
    if (typeof window === 'undefined') return { app: null, auth: null, db: null };
    if (!isCloudBaseConfigured) return { app: null, auth: null, db: null };

    const cloudbase = (await import('@cloudbase/js-sdk')).default;
    _app = cloudbase.init({
        env: cloudbaseConfig.env,
        region: cloudbaseConfig.region,
        accessKey: cloudbaseConfig.accessKey,
        auth: { detectSessionInUrl: true },
    });
    _auth = _app.auth;
    _db = _app.database();
    return { app: _app, auth: _auth, db: _db };
}

/**
 * 获取已初始化的 SDK 实例（确保只初始化一次）
 */
export function getCloudBase() {
    if (!_initPromise) {
        _initPromise = initSDK();
    }
    return _initPromise;
}

// 同步访问器（初始化完成后可用）
export function getApp() { return _app; }
export function getAuth() { return _auth; }
export function getDb() { return _db; }

// 兼容旧名称
export const isFirebaseConfigured = isCloudBaseConfigured;
