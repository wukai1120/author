'use client';

import { useState, useEffect } from 'react';
import { X, Mail, Lock, XCircle } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

/* Google G SVG — 官方配色，无背景 */
const GoogleIcon = () => (
    <svg width="18" height="18" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
);

/**
 * 独立登录弹窗（仅登录，注册入口跳转 RegisterModal）
 * 支持邮箱密码登录 + Google 登录
 */
export default function LoginModal() {
    const { showLoginModal, setShowLoginModal, setShowRegisterModal } = useAppStore();
    const [authEmail, setAuthEmail] = useState('');
    const [authPassword, setAuthPassword] = useState('');
    const [authLoading, setAuthLoading] = useState(false);
    const [authError, setAuthError] = useState('');

    useEffect(() => {
        if (showLoginModal) {
            setAuthEmail('');
            setAuthPassword('');
            setAuthError('');
        }
    }, [showLoginModal]);

    if (!showLoginModal) return null;

    const handleEmailLogin = async () => {
        setAuthLoading(true);
        setAuthError('');
        try {
            const auth = await import('../lib/auth');
            await auth.signInWithEmail(authEmail, authPassword);
            const { syncFromCloud } = await import('../lib/persistence');
            const merged = await syncFromCloud();
            setShowLoginModal(false);
            if (merged > 0) window.location.reload();
        } catch (err) {
            setAuthError(err.message || '登录失败');
        } finally {
            setAuthLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        setAuthLoading(true);
        setAuthError('');
        try {
            const auth = await import('../lib/auth');
            await auth.signInWithGoogle();
            const { syncFromCloud } = await import('../lib/persistence');
            const merged = await syncFromCloud();
            setShowLoginModal(false);
            if (merged > 0) window.location.reload();
        } catch (err) {
            setAuthError(err.message || 'Google 登录失败');
        } finally {
            setAuthLoading(false);
        }
    };

    const switchToRegister = () => {
        setShowLoginModal(false);
        setTimeout(() => setShowRegisterModal(true), 150);
    };

    return (
        <div className="login-modal-overlay" onClick={() => setShowLoginModal(false)}>
            <div className="login-modal" onClick={e => e.stopPropagation()}>
                <button className="login-modal-close" onClick={() => setShowLoginModal(false)}>
                    <X size={18} />
                </button>

                {/* 头部 - Author Logo */}
                <div className="login-modal-header">
                    <div className="login-modal-icon">
                        <img src="/author-logo.png" alt="Author" className="login-modal-logo-img" />
                    </div>
                    <h2 className="login-modal-title">登录 Author</h2>
                    <p className="login-modal-desc">登录后自动同步作品到云端，支持多设备访问</p>
                </div>

                {/* 邮箱密码表单 — 放在上面 */}
                <div className="login-modal-form">
                    <div className="login-modal-input-wrap">
                        <Mail size={15} className="login-modal-input-icon" />
                        <input
                            type="email"
                            value={authEmail}
                            onChange={e => setAuthEmail(e.target.value)}
                            placeholder="邮箱地址"
                            autoComplete="email"
                            className="login-modal-input"
                        />
                    </div>
                    <div className="login-modal-input-wrap">
                        <Lock size={15} className="login-modal-input-icon" />
                        <input
                            type="password"
                            value={authPassword}
                            onChange={e => setAuthPassword(e.target.value)}
                            placeholder="密码"
                            autoComplete="current-password"
                            onKeyDown={e => { if (e.key === 'Enter' && authEmail && authPassword) handleEmailLogin(); }}
                            className="login-modal-input"
                        />
                    </div>
                </div>

                {authError && (
                    <div className="login-modal-error">
                        <XCircle size={13} /> {authError}
                    </div>
                )}

                <button
                    className="login-modal-submit-btn"
                    onClick={handleEmailLogin}
                    disabled={authLoading || !authEmail || !authPassword}
                >
                    {authLoading ? '登录中...' : '登录'}
                </button>

                {/* 分隔线 + Google 登录 — 放在下面 */}
                <div className="login-modal-divider"><span>或</span></div>

                <button
                    className="login-modal-google-btn"
                    onClick={handleGoogleLogin}
                    disabled={authLoading}
                >
                    <GoogleIcon />
                    使用 Google 账号登录
                </button>

                <div className="login-modal-switch">
                    还没有账号？<button onClick={switchToRegister}>立即注册</button>
                </div>
            </div>
        </div>
    );
}
