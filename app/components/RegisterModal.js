'use client';

import { useState, useEffect } from 'react';
import { X, Mail, Lock, CheckCircle2, XCircle } from 'lucide-react';
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
 * 独立注册弹窗
 * 支持邮箱密码注册 + Google 注册
 */
export default function RegisterModal() {
    const { showRegisterModal, setShowRegisterModal, setShowLoginModal } = useAppStore();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (showRegisterModal) {
            setEmail('');
            setPassword('');
            setConfirmPassword('');
            setError('');
        }
    }, [showRegisterModal]);

    if (!showRegisterModal) return null;

    const handleEmailRegister = async () => {
        if (password !== confirmPassword) {
            setError('两次密码输入不一致');
            return;
        }
        if (password.length < 6) {
            setError('密码至少需要 6 位');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const auth = await import('../lib/auth');
            await auth.signUpWithEmail(email, password);
            const { syncFromCloud } = await import('../lib/persistence');
            const merged = await syncFromCloud();
            setShowRegisterModal(false);
            if (merged > 0) window.location.reload();
        } catch (err) {
            setError(err.message || '注册失败');
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleRegister = async () => {
        setLoading(true);
        setError('');
        try {
            const auth = await import('../lib/auth');
            await auth.signInWithGoogle();
            const { syncFromCloud } = await import('../lib/persistence');
            const merged = await syncFromCloud();
            setShowRegisterModal(false);
            if (merged > 0) window.location.reload();
        } catch (err) {
            setError(err.message || 'Google 注册失败');
        } finally {
            setLoading(false);
        }
    };

    const switchToLogin = () => {
        setShowRegisterModal(false);
        setTimeout(() => setShowLoginModal(true), 150);
    };

    // 密码强度指示
    const pwStrength = password.length === 0 ? 0 : password.length < 6 ? 1 : password.length < 10 ? 2 : 3;
    const pwColors = ['', '#ef4444', '#f59e0b', '#22c55e'];
    const pwLabels = ['', '太短', '一般', '强'];

    return (
        <div className="login-modal-overlay" onClick={() => setShowRegisterModal(false)}>
            <div className="login-modal register-modal" onClick={e => e.stopPropagation()}>
                <button className="login-modal-close" onClick={() => setShowRegisterModal(false)}>
                    <X size={18} />
                </button>

                {/* 头部 */}
                <div className="login-modal-header">
                    <div className="login-modal-icon">
                        <img src="/author-logo.png" alt="Author" className="login-modal-logo-img" />
                    </div>
                    <h2 className="login-modal-title">创建账户</h2>
                    <p className="login-modal-desc">注册后即可开启云同步，多设备无缝创作</p>
                </div>

                {/* 邮箱注册表单 — 放在上面 */}
                <div className="login-modal-form">
                    <div className="login-modal-input-wrap">
                        <Mail size={15} className="login-modal-input-icon" />
                        <input
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder="邮箱地址"
                            autoComplete="email"
                            className="login-modal-input"
                        />
                    </div>
                    <div className="login-modal-input-wrap">
                        <Lock size={15} className="login-modal-input-icon" />
                        <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="设置密码（至少6位）"
                            autoComplete="new-password"
                            className="login-modal-input"
                        />
                    </div>
                    {/* 密码强度条 */}
                    {password.length > 0 && (
                        <div className="register-pw-strength">
                            <div className="register-pw-bar">
                                <div className="register-pw-fill" style={{ width: `${(pwStrength / 3) * 100}%`, background: pwColors[pwStrength] }} />
                            </div>
                            <span style={{ color: pwColors[pwStrength], fontSize: 11 }}>{pwLabels[pwStrength]}</span>
                        </div>
                    )}
                    <div className="login-modal-input-wrap">
                        <CheckCircle2 size={15} className="login-modal-input-icon" />
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            placeholder="确认密码"
                            autoComplete="new-password"
                            onKeyDown={e => { if (e.key === 'Enter' && email && password && confirmPassword) handleEmailRegister(); }}
                            className="login-modal-input"
                        />
                    </div>
                </div>

                {error && (
                    <div className="login-modal-error">
                        <XCircle size={13} /> {error}
                    </div>
                )}

                <button
                    className="login-modal-submit-btn"
                    onClick={handleEmailRegister}
                    disabled={loading || !email || !password || !confirmPassword}
                >
                    {loading ? '注册中...' : '注册'}
                </button>

                {/* 分隔线 + Google 注册 — 放在下面 */}
                <div className="login-modal-divider"><span>或</span></div>

                <button
                    className="login-modal-google-btn"
                    onClick={handleGoogleRegister}
                    disabled={loading}
                >
                    <GoogleIcon />
                    使用 Google 账号注册
                </button>

                <div className="login-modal-switch">
                    已有账号？<button onClick={switchToLogin}>返回登录</button>
                </div>
            </div>
        </div>
    );
}
