'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { X, Mail, Lock, XCircle, ArrowLeft, User as UserIcon } from 'lucide-react';
import { useI18n } from '../lib/useI18n';
import { legalDocUrl } from '../lib/constants';
import WechatIcon from '../components/icons/WechatIcon';

function getSafeNext(next) {
    if (!next || typeof next !== 'string') return '/';
    if (!next.startsWith('/') || next.startsWith('//')) return '/';
    return next;
}

export default function RegisterPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { t, language } = useI18n();

    const nextPath = useMemo(() => getSafeNext(searchParams.get('next')), [searchParams]);

    const [email, setEmail] = useState('');
    const [nickname, setNickname] = useState('');
    const [otpCode, setOtpCode] = useState('');
    const [step, setStep] = useState('email');
    const [verifyFn, setVerifyFn] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [countdown, setCountdown] = useState(0);
    const [cloudBaseAvailable, setCloudBaseAvailable] = useState(false);
    const [authChecking, setAuthChecking] = useState(true);

    const termsUrl = legalDocUrl('github', 'TERMS', language);
    const privacyUrl = legalDocUrl('github', 'PRIVACY', language);
    const termsUrlMirror = legalDocUrl('gitee', 'TERMS', language);
    const privacyUrlMirror = legalDocUrl('gitee', 'PRIVACY', language);

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
        if (!email || !cloudBaseAvailable) return;
        setLoading(true);
        setError('');
        try {
            const auth = await import('../lib/auth');
            const result = await auth.sendEmailOtpUnified(email, nickname || undefined);
            setVerifyFn(() => result.verifyOtp);
            setStep('otp');
            setCountdown(60);
        } catch (err) {
            setError(err.message || t('registerModal.registerFailed') || '发送验证码失败');
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

    const handleWechatRegister = async () => {
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
            <div className="login-modal register-modal" onClick={e => e.stopPropagation()}>
                <button className="login-modal-close" onClick={() => router.push('/')}>
                    <X size={18} />
                </button>

                <div className="login-modal-header">
                    <div className="login-modal-icon">
                        <img src="/author-logo.png" alt="Author" className="login-modal-logo-img" />
                    </div>
                    <h2 className="login-modal-title">{t('registerModal.title')}</h2>
                    <p className="login-modal-desc">{t('registerModal.desc')}</p>
                </div>

                {!cloudBaseAvailable && (
                    <div className="login-modal-error">
                        <XCircle size={13} /> CloudBase 未配置，当前不可注册
                    </div>
                )}

                {step === 'email' ? (
                    <>
                        <div className="login-modal-form">
                            <div className="login-modal-input-wrap">
                                <Mail size={15} className="login-modal-input-icon" />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    placeholder={t('registerModal.emailPlaceholder')}
                                    autoComplete="email"
                                    className="login-modal-input"
                                />
                            </div>
                            <div className="login-modal-input-wrap">
                                <UserIcon size={15} className="login-modal-input-icon" />
                                <input
                                    type="text"
                                    value={nickname}
                                    onChange={e => setNickname(e.target.value)}
                                    placeholder="昵称（可选）"
                                    autoComplete="nickname"
                                    className="login-modal-input"
                                    onKeyDown={e => { if (e.key === 'Enter' && email) handleSendOtp(); }}
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
                            disabled={loading || !email || !cloudBaseAvailable}
                        >
                            {loading ? '发送中...' : '发送验证码'}
                        </button>
                    </>
                ) : (
                    <>
                        <div className="login-modal-form">
                            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8, textAlign: 'center' }}>
                                验证码已发送至 <strong style={{ color: 'var(--text-primary)' }}>{email}</strong>
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
                            {loading ? t('registerModal.registering') || '注册中...' : t('registerModal.registerBtn') || '注册'}
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

                <div className="login-modal-divider"><span>{t('registerModal.or') || '或'}</span></div>

                <button
                    className="login-modal-google-btn"
                    onClick={handleWechatRegister}
                    disabled={loading || !cloudBaseAvailable}
                >
                    <WechatIcon />
                    微信注册
                </button>

                <p className="login-modal-terms">
                    {t('registerModal.agreeTerms')}
                    <a href={termsUrl} target="_blank" rel="noopener noreferrer">{t('registerModal.termsOfService')}</a>
                    <span className="legal-mirror-link">(<a href={termsUrlMirror} target="_blank" rel="noopener noreferrer">{t('registerModal.mirrorLink')}</a>)</span>
                    {t('registerModal.and')}
                    <a href={privacyUrl} target="_blank" rel="noopener noreferrer">{t('registerModal.privacyPolicy')}</a>
                    <span className="legal-mirror-link">(<a href={privacyUrlMirror} target="_blank" rel="noopener noreferrer">{t('registerModal.mirrorLink')}</a>)</span>
                </p>

                <div className="login-modal-switch">
                    {t('registerModal.hasAccount')}
                    <button onClick={() => router.push(`/login?next=${encodeURIComponent(nextPath)}`)}>
                        {t('registerModal.backToLogin')}
                    </button>
                </div>
            </div>
        </div>
    );
}
