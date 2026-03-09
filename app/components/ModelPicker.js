'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { getProjectSettings, saveProjectSettings, getChatApiConfig } from '../lib/settings';
import { PROVIDERS } from './SettingsPanel';
import { useAppStore } from '../store/useAppStore';
import { useI18n } from '../lib/useI18n';

// ProviderLogo 复用 — 简化版 SVG icons
function MiniProviderIcon({ provider, model }) {
    const p = (provider || '').toLowerCase();
    const m = (model || '').toLowerCase();

    let color = '#888';
    let emoji = '🤖';
    if (p.includes('openai') || m.includes('gpt') || m.includes('o1') || m.includes('o3')) { color = '#10a37f'; emoji = '◉'; }
    else if (p.includes('anthropic') || m.includes('claude')) { color = '#d97757'; emoji = '△'; }
    else if (p.includes('gemini') || p.includes('google') || m.includes('gemini')) { color = '#4285f4'; emoji = '✦'; }
    else if (p.includes('deepseek') || m.includes('deepseek')) { color = '#2563eb'; emoji = '◎'; }
    else if (p.includes('qwen') || p.includes('dashscope') || p.includes('ali') || p.includes('bailian') || m.includes('qwen')) { color = '#8b5cf6'; emoji = '◈'; }
    else if (p.includes('siliconflow')) { color = '#f59e0b'; emoji = '⬡'; }
    else if (p.includes('ollama') || m.includes('llama')) { color = '#14b8a6'; emoji = '▲'; }
    else if (p.includes('openrouter')) { color = '#818cf8'; emoji = '◐'; }
    else if (p.includes('volcengine') || m.includes('doubao')) { color = '#f97316'; emoji = '⬢'; }
    else if (p.includes('minimax')) { color = '#ec4899'; emoji = '▣'; }
    else if (p.includes('moonshot') || m.includes('kimi')) { color = '#6366f1'; emoji = '☽'; }
    else if (p.includes('groq')) { color = '#f97316'; emoji = '⚡'; }
    else if (p.includes('mistral')) { color = '#ff7000'; emoji = '◆'; }
    else if (p.includes('xai') || m.includes('grok')) { color = '#1d9bf0'; emoji = '✕'; }
    else if (p.includes('zhipu') || m.includes('glm')) { color = '#1677ff'; emoji = '◇'; }
    else if (p.includes('cerebras')) { color = '#22c55e'; emoji = '⊛'; }

    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 18, height: 18, borderRadius: 4,
            background: color, color: '#fff',
            fontSize: 11, fontWeight: 700, lineHeight: 1, flexShrink: 0,
        }}>{emoji}</span>
    );
}

/**
 * ModelPicker — 快速模型切换器
 * @param {string} target 'chat' | 'editor'
 * @param {function} onOpenSettings 跳转到设置面板
 * @param {string} className 附加样式类
 */
export default function ModelPicker({ target = 'editor', onOpenSettings, className = '', dropDirection = 'up' }) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [config, setConfig] = useState(null);
    const dropdownRef = useRef(null);
    const { showToast, setShowSettings } = useAppStore();
    const { t } = useI18n();

    // 读取当前配置
    const refreshConfig = useCallback(() => {
        const settings = getProjectSettings();
        if (target === 'chat') {
            setConfig({
                active: getChatApiConfig(),
                isFallback: !settings.chatApiConfig?.provider,
                providerConfigs: settings.apiConfig?.providerConfigs || {},
                mainProvider: settings.apiConfig?.provider,
                mainModel: settings.apiConfig?.model,
            });
        } else {
            setConfig({
                active: settings.apiConfig,
                isFallback: false,
                providerConfigs: settings.apiConfig?.providerConfigs || {},
            });
        }
    }, [target]);

    useEffect(() => { refreshConfig(); }, [refreshConfig]);

    // 点击外部关闭
    useEffect(() => {
        if (!open) return;
        const handler = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setOpen(false);
                setSearch('');
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    // 构建供应商分组列表
    const groups = useMemo(() => {
        if (!config) return [];
        const pc = config.providerConfigs;
        const configured = [];
        const unconfigured = [];

        for (const p of PROVIDERS) {
            const cfg = pc[p.key];
            const hasKey = !!(cfg?.apiKey || (config.active?.provider === p.key && config.active?.apiKey));
            // 只显示用户在设置中勾选加入快切列表的模型
            const userModels = cfg?.models || [];

            // 搜索过滤
            const q = search.toLowerCase();
            const providerMatch = !q || p.label.toLowerCase().includes(q) || p.key.includes(q);
            const filteredModels = q
                ? userModels.filter(m => m.toLowerCase().includes(q) || providerMatch)
                : userModels;

            if (!providerMatch && filteredModels.length === 0) continue;
            // 有勾选模型的供应商始终显示（无论是否有 key），没有勾选模型且有 key 的提示去设置
            if (userModels.length === 0) {
                if (hasKey) {
                    // 有 key 但没勾选模型 — 显示在已配置区提示去设置
                    configured.push({ provider: p, hasKey, models: [], allModels: [] });
                }
                continue;
            }

            const entry = { provider: p, hasKey, models: filteredModels, allModels: userModels };
            configured.push(entry);
        }

        return [
            { label: t('modelPicker.configured') || '已配置', items: configured },
            { label: t('modelPicker.unconfigured') || '未配置', items: unconfigured },
        ];
    }, [config, search, t]);

    // 切换模型
    const selectModel = useCallback((providerKey, modelId) => {
        const settings = getProjectSettings();
        const pc = settings.apiConfig.providerConfigs || {};
        const providerCfg = pc[providerKey] || {};
        const providerDef = PROVIDERS.find(p => p.key === providerKey);

        // 构建目标 apiConfig 片段
        const newCfg = {
            provider: providerKey,
            model: modelId,
            apiKey: providerCfg.apiKey || '',
            baseUrl: providerCfg.baseUrl || providerDef?.baseUrl || '',
            apiFormat: providerCfg.apiFormat || providerDef?.apiFormat || '',
        };

        // 更新活跃模型（不自动加入 models 列表）
        if (!pc[providerKey]) pc[providerKey] = { ...providerCfg };
        pc[providerKey].model = modelId;

        if (target === 'chat') {
            // 继承主配置中的 tools 和 searchConfig，确保搜索设置不丢失
            const mainTools = settings.apiConfig?.tools;
            const mainSearchConfig = settings.apiConfig?.searchConfig;
            settings.chatApiConfig = {
                ...newCfg,
                ...(mainTools ? { tools: mainTools } : {}),
                ...(mainSearchConfig ? { searchConfig: mainSearchConfig } : {}),
            };
        } else {
            // 先保存旧的供应商配置
            if (settings.apiConfig.provider && settings.apiConfig.provider !== providerKey) {
                const oldKey = settings.apiConfig.provider;
                if (!pc[oldKey]) pc[oldKey] = {};
                pc[oldKey].apiKey = settings.apiConfig.apiKey || '';
                pc[oldKey].baseUrl = settings.apiConfig.baseUrl || '';
                pc[oldKey].model = settings.apiConfig.model || '';
                pc[oldKey].apiFormat = settings.apiConfig.apiFormat || '';
                if (!pc[oldKey].models) pc[oldKey].models = pc[oldKey].model ? [pc[oldKey].model] : [];
            }
            Object.assign(settings.apiConfig, newCfg);
        }
        settings.apiConfig.providerConfigs = pc;
        saveProjectSettings(settings);
        refreshConfig();
        setOpen(false);
        setSearch('');
    }, [target, refreshConfig]);

    // 跟随主配置（仅 chat target）
    const followMain = useCallback(() => {
        const settings = getProjectSettings();
        settings.chatApiConfig = null;
        saveProjectSettings(settings);
        refreshConfig();
        setOpen(false);
        setSearch('');
    }, [refreshConfig]);

    if (!config) return null;

    const activeProvider = config.active?.provider || '';
    const activeModel = config.active?.model || '';
    const providerDef = PROVIDERS.find(p => p.key === activeProvider);
    const displayModel = activeModel.length > 28 ? activeModel.slice(0, 26) + '…' : activeModel;
    const targetLabel = target === 'chat'
        ? (t('modelPicker.chatModel') || '对话')
        : (t('modelPicker.editorModel') || '编辑');

    return (
        <div className={`model-picker ${className}`} ref={dropdownRef} style={{ position: 'relative' }}>
            {/* 触发按钮 */}
            <button
                className="model-picker-trigger"
                onClick={() => { setOpen(!open); if (!open) refreshConfig(); }}
                title={`${targetLabel}: ${activeProvider} / ${activeModel}`}
            >
                <MiniProviderIcon provider={activeProvider} model={activeModel} />
                <span className="model-picker-label">
                    {displayModel || (t('modelPicker.notConfigured') || '未配置')}
                </span>
                {target === 'chat' && config.isFallback && (
                    <span className="model-picker-badge">{t('modelPicker.follow') || '跟随'}</span>
                )}
                <span className="model-picker-arrow">{open ? (dropDirection === 'down' ? '▴' : '▾') : '▾'}</span>
            </button>

            {/* 下拉面板 */}
            {open && (
                <div className={`model-picker-dropdown ${dropDirection === 'down' ? 'drop-down' : ''}`}>
                    {/* 搜索 */}
                    <div className="model-picker-search-wrap">
                        <input
                            className="model-picker-search"
                            placeholder={t('modelPicker.search') || '搜索模型…'}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            autoFocus
                        />
                    </div>

                    {/* 跟随主配置（仅 chat） */}
                    {target === 'chat' && (
                        <button
                            className={`model-picker-item follow ${config.isFallback ? 'active' : ''}`}
                            onClick={followMain}
                        >
                            <span style={{ fontSize: 13 }}>🔗</span>
                            <span className="model-picker-item-name">
                                {t('modelPicker.followMain') || '跟随主配置'}
                            </span>
                            <span className="model-picker-item-sub">
                                {config.mainModel || ''}
                            </span>
                            {config.isFallback && <span className="model-picker-check">✓</span>}
                        </button>
                    )}

                    {/* 分组列表 */}
                    <div className="model-picker-list">
                        {groups.map(group => {
                            if (group.items.length === 0) return null;
                            return (
                                <div key={group.label} className="model-picker-group">
                                    <div className="model-picker-group-label">{group.label}</div>
                                    {group.items.map(({ provider: p, hasKey, models }) => (
                                        <div key={p.key} className="model-picker-provider">
                                            <div className="model-picker-provider-header">
                                                <MiniProviderIcon provider={p.key} model="" />
                                                <span className="model-picker-provider-name">{p.label}</span>
                                                {!hasKey && (
                                                    <span
                                                        className="model-picker-no-key"
                                                        onClick={() => {
                                                            setOpen(false);
                                                            if (onOpenSettings) onOpenSettings();
                                                            else setShowSettings(true);
                                                        }}
                                                    >
                                                        {t('modelPicker.noKey') || '配置 →'}
                                                    </span>
                                                )}
                                            </div>
                                            {models.map(m => {
                                                const isActive = activeProvider === p.key && activeModel === m;
                                                return (
                                                    <button
                                                        key={m}
                                                        className={`model-picker-item ${isActive ? 'active' : ''} ${!hasKey ? 'no-key' : ''}`}
                                                        onClick={() => {
                                                            if (hasKey) {
                                                                selectModel(p.key, m);
                                                            } else {
                                                                setOpen(false);
                                                                if (onOpenSettings) onOpenSettings();
                                                                else setShowSettings(true);
                                                            }
                                                        }}
                                                    >
                                                        <span className="model-picker-item-name" style={!hasKey ? { opacity: 0.55 } : undefined}>{m}</span>
                                                        {isActive && <span className="model-picker-check">✓</span>}
                                                        {!hasKey && <span className="model-picker-no-key-hint">🔑</span>}
                                                    </button>
                                                );
                                            })}
                                            {hasKey && models.length === 0 && (
                                                <div className="model-picker-empty">
                                                    {t('modelPicker.noModels') || '暂无模型，请在设置中添加'}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            );
                        })}
                    </div>

                    {/* 打开设置 */}
                    <div className="model-picker-footer">
                        <button
                            className="model-picker-settings-btn"
                            onClick={() => {
                                setOpen(false);
                                if (onOpenSettings) onOpenSettings();
                                else setShowSettings(true);
                            }}
                        >
                            ⚙️ {t('modelPicker.openSettings') || '管理供应商'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
