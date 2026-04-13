'use client';

// ==================== CloudBase Auth 封装 ====================
// 提供统一的认证接口，供 SettingsPanel 和 persistence 层使用
// 支持邮箱 OTP 登录/注册 + 微信 OAuth 登录

import { isCloudBaseConfigured, getCloudBase, getAuth as getAuthInstance } from './cloudbase';

// ==================== 状态管理 ====================

let _currentUser = null;
const _listeners = new Set();
let _authStateUnsubscribe = null;

// 将 CloudBase 用户对象适配为统一格式（兼容旧 Firebase 字段）
function normalizeUser(cbUser) {
    if (!cbUser) return null;
    return {
        uid: cbUser.id,
        email: cbUser.email || '',
        displayName: cbUser.user_metadata?.nickName || cbUser.user_metadata?.name || '',
        photoURL: cbUser.user_metadata?.avatarUrl || cbUser.user_metadata?.picture || '',
        provider: cbUser.app_metadata?.provider || '',
        providers: cbUser.app_metadata?.providers || [],
        isAnonymous: cbUser.is_anonymous || false,
        metadata: {
            creationTime: cbUser.created_at,
            lastSignInTime: cbUser.last_sign_in_at,
        },
        // 保留原始对象以便需要时访问
        _raw: cbUser,
    };
}

// 初始化认证状态监听（应在应用启动时调用一次）
export async function initAuth() {
    if (!isCloudBaseConfigured) return;
    if (_authStateUnsubscribe) return; // 避免重复初始化

    const { auth } = await getCloudBase();
    if (!auth) return;

    const { data } = auth.onAuthStateChange((event, session, info) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED' || event === 'INITIAL_SESSION') {
            const user = session?.user ? normalizeUser(session.user) : null;
            _currentUser = user;
            if (user) saveAccountToHistory(user);
            _listeners.forEach(fn => {
                try { fn(user); } catch (e) { console.error('[auth] listener error:', e); }
            });
        } else if (event === 'SIGNED_OUT') {
            _currentUser = null;
            _listeners.forEach(fn => {
                try { fn(null); } catch (e) { console.error('[auth] listener error:', e); }
            });
        }
    });

    _authStateUnsubscribe = data?.subscription?.unsubscribe || null;

    // 立即检查当前会话
    auth.getSession().then(({ data: sessionData }) => {
        if (sessionData?.session?.user) {
            const user = normalizeUser(sessionData.session.user);
            _currentUser = user;
            if (user) saveAccountToHistory(user);
            _listeners.forEach(fn => {
                try { fn(user); } catch (e) { console.error('[auth] listener error:', e); }
            });
        }
    }).catch(() => {});
}

// ==================== 账号历史 ====================

const ACCOUNT_HISTORY_KEY = 'author-account-history';

function saveAccountToHistory(user) {
    if (typeof window === 'undefined' || !user) return;
    try {
        const history = getAccountHistory();
        const existing = history.findIndex(a => a.uid === user.uid);
        const entry = {
            uid: user.uid,
            email: user.email || '',
            displayName: user.displayName || '',
            photoURL: user.photoURL || '',
            provider: user.provider || 'email',
            lastLogin: Date.now(),
        };
        if (existing >= 0) {
            history[existing] = entry;
        } else {
            history.unshift(entry);
        }
        // 最多保存 5 个账号
        localStorage.setItem(ACCOUNT_HISTORY_KEY, JSON.stringify(history.slice(0, 5)));
    } catch {}
}

export function getAccountHistory() {
    if (typeof window === 'undefined') return [];
    try {
        return JSON.parse(localStorage.getItem(ACCOUNT_HISTORY_KEY) || '[]');
    } catch { return []; }
}

export function removeAccountFromHistory(uid) {
    if (typeof window === 'undefined') return;
    try {
        const history = getAccountHistory().filter(a => a.uid !== uid);
        localStorage.setItem(ACCOUNT_HISTORY_KEY, JSON.stringify(history));
    } catch {}
}

// 获取当前登录用户
export function getCurrentUser() {
    return _currentUser;
}

// 是否已登录
export function isSignedIn() {
    return _currentUser !== null;
}

// 注册认证状态变化回调
export function onAuthChange(callback) {
    _listeners.add(callback);
    // 立即通知当前状态
    if (_currentUser !== undefined) callback(_currentUser);
    return () => _listeners.delete(callback);
}

// ==================== 邮箱 OTP 登录 ====================

/**
 * 发送邮箱 OTP 验证码（登录）
 * @param {string} email
 * @returns {Promise<{verifyOtp: Function}>} 返回验证函数
 */
export async function sendEmailOtp(email) {
    const { auth } = await getCloudBase();
    if (!auth) throw new Error('CloudBase 未配置');
    const { data, error } = await auth.signInWithOtp({ email });
    if (error) throw new Error(error.message || '发送验证码失败');
    return {
        verifyOtp: async (token) => {
            const { data: loginData, error: loginError } = await data.verifyOtp({ token });
            if (loginError) throw new Error(loginError.message || '验证码错误');
            return loginData;
        }
    };
}

// ==================== 邮箱 OTP 注册 ====================

/**
 * 发送邮箱 OTP 验证码（注册）
 * @param {string} email
 * @param {string} [nickname]
 * @returns {Promise<{verifyOtp: Function}>}
 */
export async function sendSignUpOtp(email, nickname) {
    const { auth } = await getCloudBase();
    if (!auth) throw new Error('CloudBase 未配置');
    const params = { email };
    if (nickname) params.nickname = nickname;
    const { data, error } = await auth.signUp(params);
    if (error) throw new Error(error.message || '发送验证码失败');
    return {
        verifyOtp: async (token) => {
            const { data: loginData, error: loginError } = await data.verifyOtp({ token });
            if (loginError) throw new Error(loginError.message || '验证码错误');
            return loginData;
        }
    };
}

// ==================== 微信 OAuth 登录 ====================

export async function signInWithWechat() {
    const { auth } = await getCloudBase();
    if (!auth) throw new Error('CloudBase 未配置');
    const { data, error } = await auth.signInWithOAuth({ provider: 'wechat' });
    if (error) throw new Error(error.message || '微信登录失败');
    // OAuth 会跳转到微信授权页，回调后自动完成登录
    if (data?.url) {
        window.location.href = data.url;
    }
    return data;
}

// ==================== 退出登录 ====================

export async function signOut() {
    const { auth } = await getCloudBase();
    if (!auth) return;
    const { error } = await auth.signOut();
    if (error) console.warn('[auth] sign out error:', error.message);
    _currentUser = null;
    _listeners.forEach(fn => {
        try { fn(null); } catch {}
    });
}

// ==================== 兼容旧接口（SettingsPanel 中使用） ====================

// 旧邮箱密码登录 → 现改为发送 OTP 的第一步
export async function signInWithEmail(email) {
    return sendEmailOtp(email);
}

// 旧邮箱密码注册 → 现改为发送注册 OTP 的第一步
export async function signUpWithEmail(email, nickname) {
    return sendSignUpOtp(email, nickname);
}

// 旧 Google 登录 → 现改为微信登录
export async function signInWithGoogle() {
    return signInWithWechat();
}

// ==================== 工具方法 ====================

// 获取用户显示信息
export function getUserProfile() {
    if (!_currentUser) return null;
    return {
        uid: _currentUser.uid,
        email: _currentUser.email,
        displayName: _currentUser.displayName,
        photoURL: _currentUser.photoURL,
    };
}

// 更新用户个人资料（昵称 / 头像）
export async function updateUserProfile({ displayName, photoURL }) {
    const { auth } = await getCloudBase();
    if (!auth) throw new Error('未登录');
    const updates = {};
    if (displayName !== undefined) updates.nickname = displayName;
    if (photoURL !== undefined) updates.avatar_url = photoURL;
    const { data, error } = await auth.updateUser(updates);
    if (error) throw new Error(error.message || '更新失败');
    // 刷新内部缓存
    if (data?.user) {
        _currentUser = normalizeUser(data.user);
        _listeners.forEach(fn => { try { fn(_currentUser); } catch {} });
    }
}

// 切换账号：先退出再打开登录弹窗
export async function switchAccount() {
    await signOut();
}
