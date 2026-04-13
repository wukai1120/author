'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { X, Mail, Lock, XCircle, ArrowLeft } from 'lucide-react';
import { useI18n } from '../lib/useI18n';
import WechatIcon from '../components/icons/WechatIcon';

function getSafeNext(next) {
    if (!next || typeof next !== 'string') return '/';
    if (!next.startsWith('/') || next.startsWith('//')) return '/';
    return next;
}

export default function LoginPage({ searchParams }) {
    const router = useRouter();
    const { t } = useI18n();

    const nextPath = getSafeNext(searchParams?.next);

    const [authEmail, setAuthEmail] = useState('');
    const [otpCode, setOtpCode] = useState('');
    const [step, setStep] = useState('email');
    const [verifyFn, setVerifyFn] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [countdown, setCountdown] = useState(0);
    const [cloudBaseAvailable, setCloudBaseAvailable] = useState(false);
    const [authChecking, setAuthChecking] = useState(true);

    useEffect(() => {
        if (countdown <= 0) return;
        const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
        return () => clearTimeout(timer);
    }, [countdown]);

    useEffect(() => {
        let unmounted = false;
        let unsubscribe = null;

        (async () => {
            try {
                const { isCloudBaseConfigured } = await import('../lib/cloudbase');
                if (!isCloudBaseConfigured || unmounted) return;
                setCloudBaseAvailable(true);
                const auth = await import('../lib/auth');
                await auth.initAuth();
                unsubscribe = auth.onAuthChange(user => {
                    if (unmounted) return;
                    if (user) {
                        router.replace(nextPath);
                        return;
                    }
                    setAuthChecking(false);
                });
            } catch {
                if (!unmounted) setAuthChecking(false);
            }
        })();

        return () => {
            unmounted = true;
            if (unsubscribe) unsubscribe();
        };
    }, [nextPath, router]);

    if (authChecking) return null;

    const handleSendOtp = async () => {
        if (!authEmail || !cloudBaseAvailable) return;
        setLoading(true);
        setError('');
        try {
            const auth = await import('../lib/auth');
            const result = await auth.sendEmailOtpUnified(authEmail);
            setVerifyFn(() => result.verifyOtp);
            setStep('otp');
            setCountdown(60);
        } catch (err) {
            setError(err.message || t('loginModal.loginFailed') || '发送验证码失败');
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyOtp = async () => {
        if (!otpCode || !verifyFn) return;
        setLoading(true);
        setError('');
        try {
            await verifyFn(otpCode);
            router.replace(nextPath);
        } catch (err) {
            setError(err.message || '验证码错误');
        } finally {
            setLoading(false);
        }
    };

    const handleWechatLogin = async () => {
        if (!cloudBaseAvailable) return;
        setLoading(true);
        setError('');
        try {
            const auth = await import('../lib/auth');
            await auth.signInWithWechat();
        } catch (err) {
            setError(err.message || '微信登录失败');
            setLoading(false);
        }
    };

    return (
        <div className="login-modal-overlay">
            <div className="login-modal" onClick={e => e.stopPropagation()}>
                <button className="login-modal-close" onClick={() => router.push('/')}>
                    <X size={18} />
                </button>

                <div className="login-modal-header">
                    <div className="login-modal-icon">
                        <img src="/author-logo.png" alt="Author" className="login-modal-logo-img" />
                    </div>
                    <h2 className="login-modal-title">{t('loginModal.title')}</h2>
                    <p className="login-modal-desc">{t('loginModal.desc')}</p>
                </div>

                {!cloudBaseAvailable && (
                    <div className="login-modal-error">
                        <XCircle size={13} /> CloudBase 未配置，当前不可登录
                    </div>
                )}

                {step === 'email' ? (
                    <>
                        <div className="login-modal-form">
                            <div className="login-modal-input-wrap">
                                <Mail size={15} className="login-modal-input-icon" />
                                <input
                                    type="email"
                                    value={authEmail}
                                    onChange={e => setAuthEmail(e.target.value)}
                                    placeholder={t('loginModal.emailPlaceholder')}
                                    autoComplete="email"
                                    className="login-modal-input"
                                    onKeyDown={e => { if (e.key === 'Enter' && authEmail) handleSendOtp(); }}
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
                            onClick={handleSendOtp}
                            disabled={loading || !authEmail || !cloudBaseAvailable}
                        >
                            {loading ? '发送中...' : '发送验证码'}
                        </button>
                    </>
                ) : (
                    <>
                        <div className="login-modal-form">
                            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8, textAlign: 'center' }}>
                                验证码已发送至 <strong style={{ color: 'var(--text-primary)' }}>{authEmail}</strong>
                            </div>
                            <div className="login-modal-input-wrap">
                                <Lock size={15} className="login-modal-input-icon" />
                                <input
                                    type="text"
                                    value={otpCode}
                                    onChange={e => setOtpCode(e.target.value)}
                                    placeholder="输入验证码"
                                    autoComplete="one-time-code"
                                    className="login-modal-input"
                                    autoFocus
                                    onKeyDown={e => { if (e.key === 'Enter' && otpCode) handleVerifyOtp(); }}
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
                            onClick={handleVerifyOtp}
                            disabled={loading || !otpCode}
                        >
                            {loading ? t('loginModal.loggingIn') || '登录中...' : t('loginModal.loginBtn') || '登录'}
                        </button>

                        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 8, fontSize: 13 }}>
                            <button
                                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-ui)' }}
                                onClick={() => { setStep('email'); setError(''); setOtpCode(''); }}
                            >
                                <ArrowLeft size={13} /> 更换邮箱
                            </button>
                            <button
                                style={{ background: 'none', border: 'none', color: countdown > 0 ? 'var(--text-muted)' : 'var(--accent)', cursor: countdown > 0 ? 'default' : 'pointer', fontFamily: 'var(--font-ui)' }}
                                onClick={handleSendOtp}
                                disabled={countdown > 0 || loading}
                            >
                                {countdown > 0 ? `${countdown}s 后重发` : '重新发送'}
                            </button>
                        </div>
                    </>
                )}

                <div className="login-modal-divider"><span>{t('loginModal.or') || '或'}</span></div>

                <button
                    className="login-modal-google-btn"
                    onClick={handleWechatLogin}
                    disabled={loading || !cloudBaseAvailable}
                >
                    <WechatIcon />
                    微信登录
                </button>

                <div className="login-modal-switch">
                    {t('loginModal.noAccount')}
                    <button onClick={() => router.push(`/register?next=${encodeURIComponent(nextPath)}`)}>
                        {t('loginModal.registerNow')}
                    </button>
                </div>
            </div>
        </div>
    );
}
