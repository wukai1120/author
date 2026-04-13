'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
    Library, Settings, BookOpen, User, MapPin, Globe, Gem,
    ClipboardList, Ruler, Upload, Download, Trash2, X, Maximize2, Minimize2,
    FileText, Sparkles, Search, Coins, Plug, Radio, RefreshCw, CheckCircle2,
    XCircle, AlertTriangle, Globe2, Shuffle, Eye, EyeOff, Ban, Pencil, FolderOpen,
    Bell, RotateCcw, Monitor, CircleDot, Smartphone, Clapperboard,
    Heart, Star, Shield, Zap, Feather, Compass, Flag, Tag, Layers,
    Bookmark, Crown, Flame, Lightbulb, Music, Palette, Sword, Target,
    Moon, Sun, Cloud, CloudOff, TreePine, Mountain, Waves, Building, Car,
    Plus
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import {
    getProjectSettings,
    saveProjectSettings,
    getSettingsNodes,
    addSettingsNode,
    updateSettingsNode,
    deleteSettingsNode,
    WRITING_MODES,
    getWritingMode,
    setWritingMode,
    saveSettingsNodes,
    getActiveWorkId,
    setActiveWorkId,
    getAllWorks,
    addWork,
    removeWork,
} from '../lib/settings';
import SettingsTree from './SettingsTree';
import { useI18n } from '../lib/useI18n';
import SettingsItemEditor from './SettingsItemEditor';
import { getModeRolePrompt } from '../lib/context-engine';
import { downloadFile, downloadBlob } from '../lib/project-io';
import {
    detectCategory, parseTextToFields, mapFieldsToContent,
    parseMultipleEntries, isStructuredText, parseStructuredText,
    preprocessPdfText,
    exportNodesToTxt, exportNodesToMarkdown,
    exportNodesToDocx, exportSettingsAsPdf, parseDocxToText, parsePdfToText,
    parsePmpxFile,
} from '../lib/settings-io';
import SettingsConflictModal from './SettingsConflictModal';

// 分类图标映射（Lucide）
const CAT_ICONS = {
    work: BookOpen,
    character: User,
    location: MapPin,
    world: Globe,
    object: Gem,
    plot: ClipboardList,
    rules: Ruler,
};
function CatIcon({ category, size = 14, ...props }) {
    const Icon = CAT_ICONS[category] || FileText;
    return <Icon size={size} {...props} />;
}

const CAT_STYLES = {
    work: { color: 'var(--cat-work)', bg: 'var(--cat-work-bg)' },
    character: { color: 'var(--cat-character)', bg: 'var(--cat-character-bg)' },
    location: { color: 'var(--cat-location)', bg: 'var(--cat-location-bg)' },
    world: { color: 'var(--cat-world)', bg: 'var(--cat-world-bg)' },
    object: { color: 'var(--cat-object)', bg: 'var(--cat-object-bg)' },
    plot: { color: 'var(--cat-plot)', bg: 'var(--cat-plot-bg)' },
    rules: { color: 'var(--cat-rules)', bg: 'var(--cat-rules-bg)' },
};

// 图标映射（与 CategorySettingsModal 共用同一套图标）
const ICON_MAP = {
    FolderOpen, User, MapPin, Globe, Gem, ClipboardList, Ruler,
    Heart, Star, Shield, Zap, Feather, Compass, Flag, Tag, Layers,
    Bookmark, Crown, Flame, Lightbulb, Music, Palette, Sword, Target,
    Moon, Sun, Cloud, TreePine, Mountain, Waves, Building, Car,
    FileText, BookOpen,
};
const ICON_GRID = [
    'User', 'Heart', 'Star', 'Shield', 'Zap', 'Crown',
    'Sword', 'Flag', 'Target', 'Compass', 'Feather', 'Flame',
    'Lightbulb', 'Moon', 'Sun', 'Cloud', 'TreePine', 'Mountain',
    'Waves', 'Building', 'Music', 'Palette', 'Bookmark', 'BookOpen',
    'MapPin', 'Globe', 'Gem', 'Tag', 'Layers', 'Car',
    'ClipboardList', 'Ruler', 'FolderOpen', 'FileText',
];
function getIconByName(name) {
    return ICON_MAP[name] || null;
}

export default function SettingsPanel() {
    const {
        showSettings: open,
        setShowSettings,
        setWritingMode: setGlobalWritingMode,
        incrementSettingsVersion,
        jumpToNodeId,
        setJumpToNodeId,
    } = useAppStore();

    const onClose = () => {
        setShowSettings(false);
        setGlobalWritingMode(getWritingMode());
        incrementSettingsVersion();
    };

    const [settings, setSettings] = useState(null);

    const [nodes, setNodes] = useState([]);
    const [works, setWorks] = useState([]);
    const [selectedNodeId, setSelectedNodeId] = useState(null);
    const [writingMode, setWritingModeState] = useState('webnovel');
    const [searchQuery, setSearchQuery] = useState('');
    const [activeWorkId, setActiveWorkIdState] = useState(null);
    const [showNewWorkInput, setShowNewWorkInput] = useState(false);
    const [newWorkName, setNewWorkName] = useState('');
    const { t } = useI18n();

    const [expandedCategory, setExpandedCategory] = useState(null);
    const [showExportFormat, setShowExportFormat] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [iconPickerCat, setIconPickerCat] = useState(null); // 当前打开图标选择器的分类
    const [iconPickerRect, setIconPickerRect] = useState(null);

    // 删除确认弹窗状态
    const [deleteConfirm, setDeleteConfirm] = useState(null); // { message, onConfirm }

    // 检查是否应跳过删除确认
    const shouldSkipDeleteConfirm = () => {
        try {
            if (localStorage.getItem('author-delete-never-remind') === 'true') return true;
            const skipDate = localStorage.getItem('author-delete-skip-today');
            if (skipDate && skipDate === new Date().toISOString().slice(0, 10)) return true;
        } catch { /* ignore */ }
        return false;
    };

    // 获取当前作品的节点
    useEffect(() => {
        if (open) {
            setSettings(getProjectSettings());
            const loadData = async () => {
                // 加载作品列表
                const allWorks = await getAllWorks();
                setWorks(allWorks);

                // 初始化激活作品
                let wid = getActiveWorkId();
                if (!wid || !allWorks.find(w => w.id === wid)) {
                    wid = allWorks[0]?.id || null;
                    if (wid) setActiveWorkId(wid);
                }
                setActiveWorkIdState(wid);

                // 加载当前作品节点
                const workNodes = await getSettingsNodes(wid);
                setNodes(workNodes);
                setWritingModeState(getWritingMode());
                setSearchQuery('');

                // 跳转到指定节点
                if (jumpToNodeId) {
                    setSelectedNodeId(jumpToNodeId);
                    setJumpToNodeId(null);
                }
            };
            loadData();
        }
    }, [open]);

    // 当前作品节点即可见节点（无需再按作品过滤）
    const visibleNodes = nodes;

    const stats = useMemo(() => {
        const items = visibleNodes.filter(n => n.type === 'item');
        const workId = getActiveWorkId();
        // 内置分类（排除 bookInfo — 已移至独立面板）
        const builtIn = Object.entries(CAT_STYLES).filter(([cat]) => cat !== 'work').map(([cat, style]) => {
            const rf = visibleNodes.find(n => n.type === 'folder' && n.category === cat && n.parentId && n.parentId.startsWith('work-') && !visibleNodes.some(p => p.id === n.parentId));
            return {
                category: cat,
                count: items.filter(n => n.category === cat).length,
                label: t(`settings.categories.${cat}`),
                customIcon: rf?.icon || null,
                rootFolderId: rf?.id || null,
                ...style,
            };
        });
        // 用户自建分类（parentId === workId 的 folder/special，且 category 不在 CAT_STYLES 内，排除 bookInfo）
        const builtInCats = new Set(Object.keys(CAT_STYLES));
        builtInCats.add('bookInfo');
        const customFolders = visibleNodes.filter(n =>
            (n.type === 'folder' || n.type === 'special') && n.parentId === workId && !builtInCats.has(n.category)
        );
        // 每个自定义 folder 独立出一张卡片（不按 category 去重，因为多个 folder 可能共享 category='custom'）
        const countDescendants = (folderId) => {
            let count = 0;
            visibleNodes.filter(n => n.parentId === folderId).forEach(child => {
                if (child.type === 'item') count++;
                else count += countDescendants(child.id);
            });
            return count;
        };
        const custom = customFolders.map(rf => ({
            category: `custom__${rf.id}`,
            realCategory: rf.category,
            count: countDescendants(rf.id),
            label: rf.name || rf.category,
            customIcon: rf.icon || null,
            rootFolderId: rf.id,
            color: 'var(--cat-custom, #64748b)',
            bg: 'var(--cat-custom-bg, rgba(100,116,139,0.08))',
            isCustom: true,
        }));
        return [...builtIn, ...custom];
    }, [visibleNodes, t]);

    // 更换分类图标
    const handleChangeCatIcon = async (category, iconName) => {
        const catStat = stats.find(s => s.category === category);
        if (!catStat?.rootFolderId) return;
        await updateSettingsNode(catStat.rootFolderId, { icon: iconName });
        setNodes(prev => prev.map(n => n.id === catStat.rootFolderId ? { ...n, icon: iconName } : n));
        setIconPickerCat(null);
    };

    const handleSwitchWork = async (workId) => {
        setActiveWorkIdState(workId);
        setActiveWorkId(workId);
        // 同步 Zustand store，触发 page.js 重载章节
        useAppStore.getState().setActiveWorkId(workId);
        setSelectedNodeId(null);
        // 重新加载该作品的节点
        const workNodes = await getSettingsNodes(workId);
        setNodes(workNodes);
    };

    const handleCreateWork = async () => {
        const name = newWorkName.trim();
        if (!name) return;
        const workNode = await addWork(name);
        setWorks(await getAllWorks());
        await handleSwitchWork(workNode.id);
        setNewWorkName('');
        setShowNewWorkInput(false);
    };

    const handleDeleteWork = async (workId) => {
        const work = nodes.find(n => n.id === workId);
        if (!work) return;
        if (works.length <= 1) { alert(t('settings.deleteWorkAlert')); return; }
        if (shouldSkipDeleteConfirm()) {
            await doDeleteWork(workId);
        } else {
            return new Promise((resolve) => {
                setDeleteConfirm({
                    message: t('settings.deleteWorkPrompt').replace('{name}', work.name),
                    onConfirm: async () => { setDeleteConfirm(null); await doDeleteWork(workId); resolve(); },
                    onCancel: () => { setDeleteConfirm(null); resolve(); },
                });
            });
        }
    };

    const doDeleteWork = async (workId) => {
        const updatedWorks = await removeWork(workId);
        setWorks(updatedWorks);
        // 切换到第一个存活的作品
        const nextWork = updatedWorks[0];
        if (nextWork) {
            await handleSwitchWork(nextWork.id);
        } else {
            setNodes([]);
        }
    };

    // 一键清空当前作品的所有条目（保留文件夹结构）
    const handleClearAllItems = async () => {
        if (!activeWorkId) return;
        const workEntry = works.find(w => w.id === activeWorkId);
        const workName = workEntry?.name || '';
        const itemCount = nodes.filter(n => n.type === 'item').length;
        if (itemCount === 0) return;

        const msg = t('settings.clearAllPrompt').replace('{name}', workName).replace('{count}', itemCount);
        setDeleteConfirm({
            message: msg,
            onConfirm: async () => {
                setDeleteConfirm(null);
                const updatedNodes = nodes.filter(n => n.type !== 'item');
                await saveSettingsNodes(updatedNodes, activeWorkId);
                setNodes(updatedNodes);
                setSelectedNodeId(null);
            },
            onCancel: () => setDeleteConfirm(null),
        });
    };

    // 收集当前作品的所有节点（现在就是 nodes 本身）
    const getWorkNodes = () => nodes;

    // 导出当前作品的设定集
    const handleExportSettings = async (format = 'json') => {
        if (!activeWorkId) return;
        const workEntry = works.find(w => w.id === activeWorkId);
        if (!workEntry) return;
        const workNodes = getWorkNodes();
        const baseName = workEntry.name || '设定集';
        setShowExportFormat(false);

        if (format === 'txt') {
            const txt = exportNodesToTxt(workNodes);
            await downloadFile(txt, `${baseName}-设定集.txt`, 'text/plain');
        } else if (format === 'md') {
            const md = exportNodesToMarkdown(workNodes);
            await downloadFile(md, `${baseName}-设定集.md`, 'text/markdown');
        } else if (format === 'docx') {
            const blob = await exportNodesToDocx(workNodes);
            await downloadBlob(blob, `${baseName}-设定集.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        } else if (format === 'pdf') {
            exportSettingsAsPdf(workNodes);
        } else {
            // JSON 格式
            const exportNodes = workNodes.filter(n => n.type !== 'work').map(({ embedding, ...rest }) => rest);
            const itemNodes = workNodes.filter(n => n.type === 'item');
            const items = itemNodes.map(n => ({
                name: n.name,
                category: n.category || 'character',
                content: n.content || {},
            }));
            const projectSettings = getProjectSettings();
            const data = {
                type: 'author-settings-export',
                version: 2,
                workName: workEntry.name,
                exportedAt: new Date().toISOString(),
                items,
                nodes: exportNodes,
                writingMode: projectSettings.writingMode || 'webnovel',
            };
            await downloadFile(JSON.stringify(data, null, 2), `${baseName}-设定集.json`, 'application/json');
        }
    };

    // 导入设定集
    const handleImportSettings = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';
        const ext = file.name.split('.').pop().toLowerCase();

        // PMPX 导入（排骨笔记）— 独立流程
        if (ext === 'pmpx') {
            try {
                if (!activeWorkId) { alert(t('settings.importNoWork')); return; }
                const importedItems = await parsePmpxFile(file);
                if (importedItems.length === 0) {
                    alert(t('settings.importEmpty') || '未能从文件中解析出任何设定条目');
                    return;
                }
                // 检测冲突
                const existingItems = nodes.filter(n => n.type === 'item' && n.parentId);
                const conflicts = [];
                const noConflicts = [];
                for (const item of importedItems) {
                    const existing = existingItems.find(n =>
                        n.name === item.name && n.category === item.category &&
                        nodes.find(p => p.id === n.parentId && (p.parentId === activeWorkId || p.id === activeWorkId))
                    );
                    if (existing) {
                        conflicts.push({ name: item.name, category: item.category, existing, imported: item });
                    } else {
                        noConflicts.push(item);
                    }
                }
                if (conflicts.length > 0) {
                    setConflictData({ conflicts, noConflicts });
                } else {
                    await doImportItems(noConflicts, []);
                }
            } catch (err) { alert((t('settings.importError')) + err.message); }
            return;
        }

        // 先把文件转换为纯文本
        let text;
        if (ext === 'json') {
            text = await file.text();
        } else if (ext === 'docx') {
            text = await parseDocxToText(file);
        } else if (ext === 'pdf') {
            text = await parsePdfToText(file);
            text = preprocessPdfText(text); // 恢复标题结构
        } else {
            text = await file.text();
        }

        // JSON 导入
        if (ext === 'json') {
            try {
                const data = JSON.parse(text);
                if (data.type !== 'author-settings-export') {
                    alert(t('settings.importInvalidFile')); return;
                }

                // 恢复项目设置
                const restorePS = () => {
                    if (data.writingMode) {
                        const ps = getProjectSettings();
                        ps.writingMode = data.writingMode;
                        saveProjectSettings(ps); setSettings(ps);
                        setWritingModeState(data.writingMode); setWritingMode(data.writingMode);
                    }
                };

                // 优先使用 items 简洁格式，回退到 nodes 格式
                if (Array.isArray(data.items) && data.items.length > 0) {
                    // ===== items 格式（新版 / 用户手写） =====
                    if (!activeWorkId) { alert(t('settings.importNoWork')); return; }
                    const importedItems = data.items.map(item => ({
                        name: item.name || '导入条目',
                        category: item.category || 'character',
                        content: item.content || {},
                    }));
                    // 检测冲突
                    const existingItems = nodes.filter(n => n.type === 'item' && n.parentId);
                    const conflicts = [];
                    const noConflicts = [];
                    for (const item of importedItems) {
                        const existing = existingItems.find(n =>
                            n.name === item.name && n.category === item.category &&
                            nodes.find(p => p.id === n.parentId && (p.parentId === activeWorkId || p.id === activeWorkId))
                        );
                        if (existing) {
                            conflicts.push({ name: item.name, category: item.category, existing, imported: item });
                        } else {
                            noConflicts.push(item);
                        }
                    }
                    restorePS();
                    if (conflicts.length > 0) {
                        setConflictData({ conflicts, noConflicts });
                    } else {
                        await doImportItems(noConflicts, []);
                    }
                } else if (Array.isArray(data.nodes)) {
                    // ===== nodes 格式（旧版兼容） =====
                    const importedNodes = data.nodes;
                    const importedWorkNode = importedNodes.find(n => n.type === 'work');
                    const workName = importedWorkNode?.name || data.workName || '导入作品';
                    const importedSubNodes = importedNodes.filter(n => n.type !== 'work');

                    // 兼容旧版 bookInfo
                    if (data.bookInfo && importedWorkNode && Object.values(data.bookInfo).some(v => v)) {
                        const biNode = importedSubNodes.find(n => n.parentId === importedWorkNode.id && n.category === 'bookInfo');
                        if (biNode && (!biNode.content || Object.keys(biNode.content).length === 0)) {
                            biNode.content = data.bookInfo;
                        }
                    }

                    const existingWork = works.find(w => w.name === workName);
                    if (existingWork) {
                        if (!confirm((t('settings.importOverwrite')).replace('{name}', workName))) return;
                        await saveSettingsNodes(importedSubNodes, existingWork.id);
                        restorePS();
                        setWorks(await getAllWorks());
                        await handleSwitchWork(existingWork.id);
                    } else {
                        const newWork = await addWork(workName, importedWorkNode?.id);
                        await saveSettingsNodes(importedSubNodes, newWork.id);
                        restorePS();
                        setWorks(await getAllWorks());
                        await handleSwitchWork(newWork.id);
                    }
                } else {
                    alert(t('settings.importInvalidFile')); return;
                }
            } catch (err) { alert((t('settings.importError')) + err.message); }
            return;
        }

        // TXT / MD / DOCX / PDF 智能导入
        try {
            if (!activeWorkId) { alert(t('settings.importNoWork')); return; }

            console.log('[Settings Import] activeWorkId:', activeWorkId);
            console.log('[Settings Import] text length:', text?.length, 'first 500 chars:', text?.substring(0, 500));
            console.log('[Settings Import] isStructured:', isStructuredText(text));

            // 解析文本为条目列表 [{name, category, content}]
            let importedItems = [];

            if (isStructuredText(text)) {
                const parsedEntries = parseStructuredText(text);
                console.log('[Settings Import] structured entries:', parsedEntries.length, parsedEntries.map(e => e.name));
                for (const entry of parsedEntries) {
                    const mapped = mapFieldsToContent(entry.fields, entry.category);
                    const nodeName = mapped.name || entry.name || '导入条目';
                    if (Object.keys(mapped.content).length === 0) continue;
                    importedItems.push({ name: nodeName, category: entry.category, content: mapped.content });
                }
            } else {
                const blocks = parseMultipleEntries(text);
                console.log('[Settings Import] unstructured blocks:', blocks.length);
                for (const block of blocks) {
                    const parsed = parseTextToFields(block);
                    if (Object.keys(parsed).length === 0) continue;
                    const category = detectCategory(block);
                    const mapped = mapFieldsToContent(parsed, category);
                    const nodeName = mapped.name || Object.values(parsed)[0]?.substring(0, 20) || '导入条目';
                    importedItems.push({ name: nodeName, category, content: mapped.content });
                }
            }

            console.log('[Settings Import] importedItems:', importedItems.length, importedItems.map(i => i.name));

            if (importedItems.length === 0) {
                alert(t('settings.importEmpty') || '未能从文件中解析出任何设定条目');
                return;
            }

            // 检测冲突（同名 + 同分类）
            const existingItems = nodes.filter(n => n.type === 'item' && n.parentId);
            console.log('[Settings Import] existingItems in activeWork:', existingItems.filter(n =>
                nodes.find(p => p.id === n.parentId && (p.parentId === activeWorkId || p.id === activeWorkId))
            ).map(n => `${n.name}(${n.category})`));
            const conflicts = [];
            const noConflicts = [];

            for (const item of importedItems) {
                const existing = existingItems.find(n =>
                    n.name === item.name && n.category === item.category &&
                    nodes.find(p => p.id === n.parentId && (p.parentId === activeWorkId || p.id === activeWorkId))
                );
                console.log('[Settings Import] checking:', item.name, 'cat:', item.category, '→', existing ? 'CONFLICT' : 'new');
                if (existing) {
                    conflicts.push({ name: item.name, category: item.category, existing, imported: item });
                } else {
                    noConflicts.push(item);
                }
            }

            console.log('[Settings Import] conflicts:', conflicts.length, 'noConflicts:', noConflicts.length);

            if (conflicts.length > 0) {
                // 有冲突 → 显示冲突弹窗
                console.log('[Settings Import] SHOWING CONFLICT MODAL with', conflicts.length, 'conflicts');
                setConflictData({ conflicts, noConflicts });
                return; // 不继续执行后续逻辑
            } else {
                // 无冲突 → 直接导入
                await doImportItems(noConflicts, []);
            }
        } catch (err) {
            alert((t('settings.importError')) + err.message);
        }
    };

    // 冲突解决状态
    const [conflictData, setConflictData] = useState(null);

    // 查找分类对应的父文件夹
    const catSuffixMap = {
        character: 'characters', location: 'locations', object: 'objects',
        world: 'world', plot: 'plot', rules: 'rules',
    };
    const findParentFolder = (category) => {
        const suffix = catSuffixMap[category] || category;
        let parentId = nodes.find(n => n.parentId === activeWorkId && n.id.endsWith('-' + suffix))?.id;
        if (!parentId) {
            parentId = nodes.find(n => n.parentId === activeWorkId && n.category === category)?.id;
        }
        return parentId || activeWorkId;
    };

    // 执行导入
    const doImportItems = async (items, updates) => {
        let updatedNodes = [...nodes];

        // 处理冲突解决的更新
        for (const up of updates) {
            updatedNodes = updatedNodes.map(n => {
                if (n.id === up.nodeId) {
                    return { ...n, content: up.content, name: up.name || n.name, updatedAt: new Date().toISOString() };
                }
                return n;
            });
        }

        // 添加新条目
        let importedCount = 0;
        for (const item of items) {
            const parentId = findParentFolder(item.category);
            const nodeId = Date.now().toString(36) + Math.random().toString(36).substr(2, 6) + importedCount;
            updatedNodes.push({
                id: nodeId, name: item.name, type: 'item',
                category: item.category, parentId, order: importedCount,
                content: item.content,
                collapsed: false, enabled: true,
                createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            });
            importedCount++;
        }

        await saveSettingsNodes(updatedNodes);
        setNodes(updatedNodes);
        const totalCount = items.length + updates.length;
        alert((t('settings.importTextSuccess') || '成功导入 {count} 个设定条目').replace('{count}', totalCount));
    };

    // 冲突解决确认
    const handleConflictConfirm = async (resolvedUpdates, noConflictItems) => {
        setConflictData(null);
        await doImportItems(noConflictItems, resolvedUpdates);
    };

    if ((!open && !conflictData) || !settings) return null;

    const handleSettingsSave = (section, data) => {
        const newSettings = { ...settings, [section]: data };
        setSettings(newSettings);
        saveProjectSettings(newSettings);
    };

    // 节点操作
    const handleAddNode = async (parentId, category) => {
        const parent = parentId ? nodes.find(n => n.id === parentId) : null;
        let cat = category || (parent ? parent.category : 'custom');
        // 如果父节点是作品节点，创建文件夹（大分类）；否则创建条目
        // 注意：getSettingsNodes 不含 work 节点，parentId 存在但找不到 parent 说明是 work 节点
        const isParentWork = (parent && parent.type === 'work') || (parentId && !parent);
        const newNode = await addSettingsNode({
            name: isParentWork ? t('settings.newFolder') : t('settings.newItem'),
            type: isParentWork ? 'folder' : 'item',
            category: cat,
            parentId,
            enabled: true,
        });
        setNodes(await getSettingsNodes());
        setSelectedNodeId(newNode.id);
    };

    const handleDeleteNode = async (id) => {
        const node = nodes.find(n => n.id === id);
        if (!node) return;
        if (shouldSkipDeleteConfirm()) {
            await doDeleteNode(id);
        } else {
            return new Promise((resolve) => {
                setDeleteConfirm({
                    message: t('settings.deleteNodePrompt').replace('{name}', node.name),
                    onConfirm: async () => { setDeleteConfirm(null); await doDeleteNode(id); resolve(); },
                    onCancel: () => { setDeleteConfirm(null); resolve(); },
                });
            });
        }
    };

    const doDeleteNode = async (id) => {
        // 收集要删除的节点 ID（包括所有子节点）
        const toDelete = new Set();
        const collect = (parentId) => {
            toDelete.add(parentId);
            nodes.filter(n => n.parentId === parentId).forEach(n => collect(n.id));
        };
        collect(id);
        // 乐观更新：直接从 React 状态移除，不重新读取存储
        setNodes(nodes.filter(n => !toDelete.has(n.id)));
        if (selectedNodeId === id) setSelectedNodeId(null);
        // 后台持久化删除
        deleteSettingsNode(id);
    };

    const handleRenameNode = async (id, newName) => {
        await updateSettingsNode(id, { name: newName });
        setNodes(await getSettingsNodes());
    };

    const handleToggleEnabled = async (id) => {
        const node = nodes.find(n => n.id === id);
        if (!node) return;
        const newEnabled = node.enabled === false ? true : false;
        await updateSettingsNode(id, { enabled: newEnabled });
        setNodes(prev => prev.map(n => n.id === id ? { ...n, enabled: newEnabled } : n));
    };

    const handleUpdateNode = (id, updates) => {
        // 乐观更新：立即同步 React 状态，防止异步操作（如 embedding API）导致文字回退
        const updatedNodes = nodes.map(n => n.id === id ? { ...n, ...updates, updatedAt: new Date().toISOString() } : n);
        setNodes(updatedNodes);
        // 后台持久化（传入当前节点，避免重新读取 API）
        updateSettingsNode(id, updates, updatedNodes);
    };

    const selectedNode = visibleNodes.find(n => n.id === selectedNodeId);
    const showBookInfo = selectedNode?.type === 'special' && selectedNode?.category === 'bookInfo';

    // 面板标题映射
    const panelTitles = {
        settings: { icon: <Library size={20} style={{ verticalAlign: 'text-bottom' }} />, title: t('settings.tabSettings'), subtitle: t('settings.subtitle') },
        preferences: { icon: <Settings size={20} style={{ verticalAlign: 'text-bottom' }} />, title: t('settings.tabPreferences'), subtitle: '' },
    };
    const currentPanel = panelTitles[open] || panelTitles.settings;

    // 始终挂载在 DOM，用 CSS display 切换可见性 —— 零渲染开销
    return (
        <div className="settings-panel-overlay" style={{ display: open ? '' : 'none' }} onMouseDown={e => { e.currentTarget._mouseDownTarget = e.target; }} onClick={e => { if (e.currentTarget._mouseDownTarget === e.currentTarget) onClose(); }}>
            <div className={`settings-panel-container glass-panel${isFullscreen ? ' fullscreen' : ''}`} onClick={e => e.stopPropagation()}>
                {/* 头部 */}
                <div className="settings-header" style={{ background: 'transparent' }}>
                    <h2>
                        {currentPanel.icon} {currentPanel.title}
                        {currentPanel.subtitle && <span className="subtitle">— {currentPanel.subtitle}</span>}
                    </h2>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        {open === 'settings' && <button className="btn btn-ghost btn-icon" onClick={() => setIsFullscreen(!isFullscreen)} title={isFullscreen ? '退出全屏' : '全屏'}>
                            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                        </button>}
                        <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={16} /></button>
                    </div>
                </div>

                {/* 内容区 */}
                {open === 'preferences' ? (
                    <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
                        <PreferencesForm />
                    </div>
                ) : (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        {/* 作品切换器 - 下拉菜单 */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 24px', borderBottom: '1px solid var(--border-light)', background: 'var(--bg-secondary)' }}>
                            <BookOpen size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                            <span style={{ fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{t('settings.workLabel')}</span>
                            <div style={{ position: 'relative', flex: '0 1 auto' }}>
                                <select
                                    value={activeWorkId || ''}
                                    onChange={e => handleSwitchWork(e.target.value)}
                                    style={{
                                        padding: '6px 36px 6px 12px',
                                        border: '1.5px solid var(--accent, #6366f1)',
                                        borderRadius: 10,
                                        background: 'var(--bg-card, #fff)',
                                        color: 'var(--text-primary)',
                                        fontSize: 13, fontWeight: 600,
                                        cursor: 'pointer', outline: 'none',
                                        appearance: 'none', WebkitAppearance: 'none',
                                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%236366f1' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M7 10l5 5 5-5'/%3E%3C/svg%3E")`,
                                        backgroundRepeat: 'no-repeat',
                                        backgroundPosition: 'right 10px center',
                                        boxShadow: '0 1px 4px rgba(99,102,241,0.08)',
                                        transition: 'all 0.15s',
                                        minWidth: 100,
                                    }}
                                    onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-glow, rgba(99,102,241,0.15))'; }}
                                    onBlur={e => { e.currentTarget.style.borderColor = 'var(--accent, #6366f1)'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(99,102,241,0.08)'; }}
                                >
                                    {works.map(w => (
                                        <option key={w.id} value={w.id}>{w.name}</option>
                                    ))}
                                </select>
                            </div>
                            {showNewWorkInput ? (
                                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                    <input style={{ padding: '5px 10px', border: '1.5px solid var(--accent)', borderRadius: 10, fontSize: 12, background: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none', width: 120 }}
                                        value={newWorkName} onChange={e => setNewWorkName(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') handleCreateWork(); if (e.key === 'Escape') setShowNewWorkInput(false); }}
                                        placeholder={t('settings.workNamePlaceholder')} autoFocus />
                                    <button className="btn btn-primary btn-sm" style={{ padding: '4px 10px', fontSize: 11, borderRadius: 8 }} onClick={handleCreateWork}>{t('settings.confirmBtn')}</button>
                                    <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => setShowNewWorkInput(false)}>{t('common.cancel')}</button>
                                </div>
                            ) : (
                                <button style={{ padding: '5px 10px', border: '1px dashed var(--border-light)', borderRadius: 8, background: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', transition: 'all 0.15s' }}
                                    onClick={() => { setNewWorkName(''); setShowNewWorkInput(true); }}>{t('settings.newWork')}</button>
                            )}
                            {works.length > 1 && (
                                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 11, padding: '4px 6px', opacity: 0.7, transition: 'opacity 0.15s' }}
                                    onClick={() => handleDeleteWork(activeWorkId)} title={t('common.delete') + '作品'}
                                    onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#ef4444'; }}
                                    onMouseLeave={e => { e.currentTarget.style.opacity = '0.7'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                                ><X size={14} /></button>
                            )}
                            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 11, padding: '4px 6px', opacity: 0.7, transition: 'all 0.15s' }}
                                onClick={() => { onClose(); setTimeout(() => useAppStore.getState().setShowBookInfo(true), 80); }} title="作品管理"
                                onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--accent)'; }}
                                onMouseLeave={e => { e.currentTarget.style.opacity = '0.7'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                            ><BookOpen size={14} /></button>
                            {/* 右侧导入导出清空 */}
                            <div style={{ marginLeft: 'auto', display: 'flex', gap: 2, alignItems: 'center', position: 'relative' }}>
                                <div style={{ position: 'relative', display: 'inline-block' }}>
                                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px 6px', borderRadius: 6, transition: 'all 0.15s' }}
                                        onClick={() => setShowExportFormat(!showExportFormat)} title={t('settings.exportSettingsTitle')}
                                        onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-light, rgba(99,102,241,0.08))'; }}
                                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'none'; }}
                                    ><Upload size={13} /></button>
                                    {showExportFormat && (
                                        <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 20, overflow: 'hidden', minWidth: 120 }}>
                                            {[{ key: 'json', label: 'JSON (完整)' }, { key: 'txt', label: 'TXT (纯文本)' }, { key: 'md', label: 'Markdown' }, { key: 'docx', label: 'Word (.docx)' }, { key: 'pdf', label: 'PDF (打印)' }].map(f => (
                                                <button key={f.key} style={{ display: 'block', width: '100%', padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-primary)', textAlign: 'left', transition: 'background 0.1s' }}
                                                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                                    onClick={() => handleExportSettings(f.key)}
                                                ><FileText size={12} style={{ marginRight: 6 }} />{f.label}</button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px 6px', borderRadius: 6, transition: 'all 0.15s' }}
                                    onClick={() => document.getElementById('settings-import-input')?.click()} title={t('settings.importSettings')}
                                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-light, rgba(99,102,241,0.08))'; }}
                                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'none'; }}
                                ><Download size={13} /></button>
                                <input id="settings-import-input" type="file" accept=".json,.txt,.md,.docx,.pdf,.pmpx" onChange={handleImportSettings} style={{ display: 'none' }} />
                                <div style={{ width: 1, height: 14, background: 'var(--border-light)', margin: '0 2px' }} />
                                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px 6px', borderRadius: 6, transition: 'all 0.15s' }}
                                    onClick={handleClearAllItems} title={t('settings.clearAll') || '清空设定'}
                                    onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'none'; }}
                                ><Trash2 size={13} /></button>
                            </div>
                        </div>

                        {/* ===== 分类看板 ===== */}
                        <div style={{ flex: 1, padding: '24px 28px', overflow: 'auto' }}>
                            {/* 统计摘要 */}
                            <div style={{ display: 'flex', gap: 12, marginBottom: 20, maxWidth: 880, margin: '0 auto 20px' }}>
                                <div style={{ padding: '10px 16px', borderRadius: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', flex: 1 }}>
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 4 }}>词条总数</div>
                                    <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
                                        {stats.reduce((s, c) => s + c.count, 0)}
                                        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>条设定</span>
                                    </div>
                                </div>
                                <div style={{ padding: '10px 16px', borderRadius: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', flex: 1 }}>
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 4 }}>分类数</div>
                                    <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
                                        {stats.length}
                                        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>个分类</span>
                                    </div>
                                </div>
                            </div>

                            {/* 全局搜索框 */}
                            <div style={{ maxWidth: 880, margin: '0 auto 16px', position: 'relative' }}>
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '10px 16px',
                                    background: 'var(--bg-card, #fff)',
                                    border: '1.5px solid var(--border-light)',
                                    borderRadius: 14,
                                    transition: 'all 0.25s ease',
                                    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                                }}
                                    onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent, #6366f1)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-glow, rgba(99,102,241,0.12))'; }}
                                    onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-light)'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)'; }}
                                >
                                    <Search size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        placeholder="搜索设定条目（名称、内容或 ID）..."
                                        style={{
                                            flex: 1, border: 'none', outline: 'none',
                                            background: 'transparent', color: 'var(--text-primary)',
                                            fontSize: 13,
                                        }}
                                    />
                                    {searchQuery && (
                                        <button
                                            onClick={() => setSearchQuery('')}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, borderRadius: 4, display: 'flex', alignItems: 'center' }}
                                        ><X size={14} /></button>
                                    )}
                                </div>
                            </div>

                            {/* 搜索结果 or 分类卡片网格 */}
                            {searchQuery.trim() ? (() => {
                                const q = searchQuery.trim().toLowerCase();
                                const results = visibleNodes.filter(n => {
                                    if (n.type !== 'item') return false;
                                    if (n.name?.toLowerCase().includes(q)) return true;
                                    // 按 ID 搜索
                                    if (n.id?.toLowerCase().includes(q)) return true;
                                    // 也搜索 content 字段值
                                    if (n.content && typeof n.content === 'object') {
                                        return Object.values(n.content).some(v =>
                                            typeof v === 'string' && v.toLowerCase().includes(q)
                                        );
                                    }
                                    return false;
                                });
                                if (results.length === 0) {
                                    return (
                                        <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
                                            <Search size={36} style={{ opacity: 0.2, marginBottom: 12 }} />
                                            <div style={{ fontSize: 14, fontWeight: 500 }}>未找到匹配的设定条目</div>
                                            <div style={{ fontSize: 12, marginTop: 6, opacity: 0.7 }}>试试更换关键词</div>
                                        </div>
                                    );
                                }
                                return (
                                    <div style={{ maxWidth: 880, margin: '0 auto' }}>
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                                            找到 <strong style={{ color: 'var(--text-primary)' }}>{results.length}</strong> 个匹配结果
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            {results.map(node => {
                                                const catStyle = CAT_STYLES[node.category] || { color: '#64748b', bg: 'rgba(100,116,139,0.08)' };
                                                const catLabel = t(`settings.categories.${node.category}`) || node.category;
                                                const CatIconComp = CAT_ICONS[node.category] || FileText;
                                                // 高亮匹配片段
                                                const matchField = node.name?.toLowerCase().includes(q) ? null
                                                    : node.content && typeof node.content === 'object'
                                                        ? Object.entries(node.content).find(([, v]) => typeof v === 'string' && v.toLowerCase().includes(q))
                                                        : null;
                                                return (
                                                    <button
                                                        key={node.id}
                                                        onClick={() => {
                                                            onClose();
                                                            setTimeout(() => useAppStore.getState().setOpenCategoryModal(node.category, node.id), 80);
                                                        }}
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: 12,
                                                            padding: '12px 16px', width: '100%', textAlign: 'left',
                                                            border: '1px solid var(--border-light)', borderRadius: 12,
                                                            background: 'var(--bg-primary)', cursor: 'pointer',
                                                            transition: 'all 0.15s ease',
                                                        }}
                                                        onMouseEnter={e => { e.currentTarget.style.borderColor = catStyle.color; e.currentTarget.style.background = catStyle.bg; e.currentTarget.style.transform = 'translateX(4px)'; }}
                                                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-light)'; e.currentTarget.style.background = 'var(--bg-primary)'; e.currentTarget.style.transform = 'none'; }}
                                                    >
                                                        <span style={{
                                                            width: 32, height: 32, borderRadius: 9,
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            color: catStyle.color, background: catStyle.bg, flexShrink: 0,
                                                        }}>
                                                            <CatIconComp size={16} />
                                                        </span>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                {node.name}
                                                            </div>
                                                            {matchField && (
                                                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                    匹配字段: {matchField[1]?.substring(0, 60)}{matchField[1]?.length > 60 ? '...' : ''}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <span style={{
                                                            fontSize: 10, fontWeight: 600, padding: '3px 10px',
                                                            borderRadius: 8, color: catStyle.color, background: catStyle.bg,
                                                            whiteSpace: 'nowrap', flexShrink: 0,
                                                        }}>
                                                            {catLabel}
                                                        </span>
                                                        <span style={{ fontSize: 14, color: 'var(--text-muted)', flexShrink: 0 }}>›</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })() : (
                            <>
                            {/* 分类卡片网格 */}
                            <style>{`
                                .settings-cat-card:hover {
                                    transform: translateY(-4px);
                                    box-shadow: 0 12px 32px color-mix(in srgb, var(--cat-color) 10%, transparent), 0 0 0 1px color-mix(in srgb, var(--cat-color) 20%, transparent);
                                    border-color: color-mix(in srgb, var(--cat-color) 30%, transparent) !important;
                                }
                                .settings-cat-card [data-delete-btn] { opacity: 0; transition: all 0.15s; }
                                .settings-cat-card:hover [data-delete-btn] { opacity: 1 !important; }
                            `}</style>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16, maxWidth: 880, margin: '0 auto' }}>
                                {stats.map(cat => {
                                    const defaultIcon = CAT_ICONS[cat.category] || FileText;
                                    const CustomIcon = cat.customIcon ? (getIconByName(cat.customIcon) || defaultIcon) : defaultIcon;
                                    const Icon = CustomIcon;
                                    const color = CAT_STYLES[cat.category]?.color || '#64748b';
                                    const bg = CAT_STYLES[cat.category]?.bg || 'var(--bg-secondary)';
                                    // 获取该分类最近的几个条目名称
                                    const catItems = visibleNodes
                                        .filter(n => n.type === 'item' && n.category === cat.category && n.name)
                                        .slice(0, 3)
                                        .map(n => n.name);
                                    const isPickerOpen = iconPickerCat === cat.category;

                                    // 删除分类处理
                                    const handleDeleteCategory = (e) => {
                                        e.stopPropagation();
                                        const isCustom = cat.isCustom;
                                        const catLabel = cat.label || cat.category;

                                        if (shouldSkipDeleteConfirm()) {
                                            doDeleteCategory(cat);
                                            return;
                                        }

                                        const message = isCustom
                                            ? `确认删除分类「${catLabel}」及其下所有 ${cat.count} 条设定？此操作不可撤销。`
                                            : `确认清空「${catLabel}」下的所有 ${cat.count} 条设定？分类本身会保留，此操作不可撤销。`;

                                        setDeleteConfirm({
                                            message,
                                            onConfirm: async () => {
                                                setDeleteConfirm(null);
                                                await doDeleteCategory(cat);
                                            },
                                            onCancel: () => setDeleteConfirm(null),
                                        });
                                    };

                                    // 强制浏览器重新计算 hover 状态
                                    const forceHoverRecalc = () => {
                                        requestAnimationFrame(() => {
                                            document.body.style.pointerEvents = 'none';
                                            requestAnimationFrame(() => {
                                                document.body.style.pointerEvents = '';
                                            });
                                        });
                                    };

                                    const doDeleteCategory = async (catInfo) => {
                                        if (catInfo.isCustom && catInfo.rootFolderId) {
                                            await deleteSettingsNode(catInfo.rootFolderId);
                                        } else {
                                            const folderId = catInfo.rootFolderId;
                                            if (folderId) {
                                                const toDelete = new Set();
                                                const collectItems = (pid) => {
                                                    nodes.filter(n => n.parentId === pid).forEach(child => {
                                                        if (child.type === 'item') toDelete.add(child.id);
                                                        else collectItems(child.id);
                                                    });
                                                };
                                                collectItems(folderId);
                                                if (toDelete.size > 0) {
                                                    const updatedNodes = nodes.filter(n => !toDelete.has(n.id));
                                                    await saveSettingsNodes(updatedNodes);
                                                    setNodes(updatedNodes);
                                                    setSelectedNodeId(null);
                                                    incrementSettingsVersion();
                                                    forceHoverRecalc();
                                                    return;
                                                }
                                            }
                                        }
                                        setNodes(await getSettingsNodes());
                                        setSelectedNodeId(null);
                                        incrementSettingsVersion();
                                        forceHoverRecalc();
                                    };

                                    return (
                                        <div key={cat.category} style={{ position: 'relative' }}>
                                        <button
                                            className="settings-cat-card"
                                            style={{
                                            position: 'relative', display: 'flex', flexDirection: 'column',
                                            padding: '20px 22px 16px', textAlign: 'left', width: '100%', height: '100%',
                                            border: '1px solid var(--border-light)', borderRadius: 18,
                                            background: 'var(--bg-primary)',
                                            cursor: 'pointer', transition: 'all 0.25s ease', overflow: 'hidden',
                                            minHeight: 170,
                                            '--cat-color': color,
                                        }}
                                            onClick={() => { onClose(); setTimeout(() => useAppStore.getState().setOpenCategoryModal(cat.realCategory || cat.category), 80); }}
                                        >
                                            {/* 顶部：图标 + 计数 */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, width: '100%' }}>
                                                <span
                                                    title="点击更换图标"
                                                    onClick={e => {
                                                        e.stopPropagation();
                                                        const rect = e.currentTarget.getBoundingClientRect();
                                                        setIconPickerRect(rect);
                                                        setIconPickerCat(isPickerOpen ? null : cat.category);
                                                    }}
                                                    style={{
                                                        width: 44, height: 44, borderRadius: 13,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        color: '#fff', background: color,
                                                        boxShadow: `0 6px 16px ${color}30`,
                                                        cursor: 'pointer', transition: 'transform 0.15s',
                                                    }}
                                                    onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.12)'; }}
                                                    onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                                                >
                                                    <Icon size={22} />
                                                </span>
                                                <div style={{ textAlign: 'right' }}>
                                                    <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1, letterSpacing: '-0.5px' }}>
                                                        {cat.count}
                                                    </div>
                                                    <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 2, fontWeight: 700, marginTop: 2 }}>
                                                        ITEMS
                                                    </div>
                                                    {/* 删除按钮 */}
                                                    <span
                                                        data-delete-btn
                                                        title={cat.isCustom ? '删除此分类' : '清空此分类'}
                                                        onClick={handleDeleteCategory}
                                                        style={{
                                                            width: 28, height: 28, borderRadius: 8,
                                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                            color: 'var(--text-muted)', background: 'transparent',
                                                            cursor: 'pointer', transition: 'all 0.15s',
                                                            opacity: 0, marginTop: 4, marginLeft: 'auto',
                                                        }}
                                                        onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; }}
                                                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}
                                                    >
                                                        <Trash2 size={16} />
                                                    </span>
                                                </div>
                                            </div>

                                            {/* 标题 */}
                                            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10 }}>
                                                {cat.label}
                                            </div>

                                            {/* 预览条目 */}
                                            <div style={{ flex: 1, marginBottom: 12 }}>
                                                {catItems.length > 0 ? catItems.map((name, idx) => (
                                                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, lineHeight: 1.4 }}>
                                                        <span style={{ width: 4, height: 4, borderRadius: 2, background: color, flexShrink: 0 }} />
                                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                                                    </div>
                                                )) : (
                                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', opacity: 0.6 }}>暂无条目</div>
                                                )}
                                            </div>

                                            {/* 底部 */}
                                            <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                                    {cat.count > 0 ? `共 ${cat.count} 条` : '点击创建'}
                                                </span>
                                                <span style={{ width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-secondary)' }}>
                                                    <span style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1 }}>›</span>
                                                </span>
                                            </div>

                                            {/* 装饰水印图标 */}
                                            <div style={{ position: 'absolute', bottom: 8, right: 8, opacity: 0.04, pointerEvents: 'none' }}>
                                                <Icon size={64} />
                                            </div>
                                        </button>

                                        {/* 图标选择器弹窗 */}
                                        {isPickerOpen && (
                                            <div
                                                style={{
                                                    position: 'absolute', top: 56, left: 16, zIndex: 100,
                                                    background: 'var(--bg-card, #fff)',
                                                    border: '1px solid var(--border-light)',
                                                    borderRadius: 14,
                                                    boxShadow: '0 16px 48px rgba(0,0,0,0.18)',
                                                    padding: 12, width: 240,
                                                }}
                                                onClick={e => e.stopPropagation()}
                                            >
                                                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10, padding: '0 2px' }}>选择图标</div>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4 }}>
                                                    {ICON_GRID.map(name => {
                                                        const IcoComp = ICON_MAP[name];
                                                        if (!IcoComp) return null;
                                                        const isActive = cat.customIcon === name || (!cat.customIcon && ICON_MAP[name] === defaultIcon);
                                                        return (
                                                            <button
                                                                key={name}
                                                                style={{
                                                                    width: 34, height: 34, border: 'none', borderRadius: 8,
                                                                    background: isActive ? bg : 'transparent',
                                                                    color: isActive ? color : 'var(--text-secondary)',
                                                                    cursor: 'pointer',
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                    transition: 'all 0.12s ease',
                                                                    outline: isActive ? `2px solid ${color}` : 'none',
                                                                    outlineOffset: -2,
                                                                }}
                                                                onClick={(e) => { e.stopPropagation(); handleChangeCatIcon(cat.category, name); }}
                                                                onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'var(--bg-hover, #f3f4f6)'; e.currentTarget.style.color = color; }}}
                                                                onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}}
                                                                title={name}
                                                            >
                                                                <IcoComp size={16} />
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                        </div>
                                    );
                                })}

                                {/* 新建分类 */}
                                <button
                                    style={{
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                        padding: '20px 22px', textAlign: 'center', width: '100%',
                                        border: '2px dashed var(--border-light)', borderRadius: 18,
                                        background: 'transparent',
                                        cursor: 'pointer', transition: 'all 0.25s ease',
                                        minHeight: 170, gap: 10,
                                    }}
                                    onClick={async () => {
                                        const workId = getActiveWorkId();
                                        if (!workId) return;
                                        // 每个自定义分类需要唯一的 category ID，否则会被 stats 去重合并为一张卡片
                                        const uniqueCat = 'custom-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
                                        const newNode = await addSettingsNode({
                                            name: '新分类',
                                            type: 'folder',
                                            category: uniqueCat,
                                            parentId: workId,
                                            icon: 'Gem',
                                        });
                                        if (newNode) {
                                            setNodes(prev => [...prev, newNode]);
                                            incrementSettingsVersion();
                                        }
                                    }}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.borderColor = 'var(--accent)';
                                        e.currentTarget.style.background = 'var(--accent-light, rgba(99,102,241,0.04))';
                                        e.currentTarget.style.transform = 'translateY(-2px)';
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.borderColor = 'var(--border-light)';
                                        e.currentTarget.style.background = 'transparent';
                                        e.currentTarget.style.transform = 'none';
                                    }}
                                >
                                    <span style={{
                                        width: 44, height: 44, borderRadius: 13,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: 'var(--text-muted)', background: 'var(--bg-secondary)',
                                        border: '1px solid var(--border-light)',
                                    }}>
                                        <Plus size={22} />
                                    </span>
                                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)' }}>新建分类</span>
                                </button>
                            </div>
                            </>
                            )}
                        </div>
                    </div>
                )}
            </div>
            {
                conflictData && createPortal(
                    <SettingsConflictModal
                        conflicts={conflictData.conflicts}
                        noConflicts={conflictData.noConflicts}
                        onConfirm={handleConflictConfirm}
                        onClose={() => setConflictData(null)}
                    />,
                    document.body // Render into document.body or a specific portal root
                )
            }
            {
                deleteConfirm && createPortal(
                    <DeleteConfirmModal
                        message={deleteConfirm.message}
                        onConfirm={deleteConfirm.onConfirm}
                        onCancel={deleteConfirm.onCancel}
                    />,
                    document.body
                )
            }
        </div>
    );
}

function PreferencesForm() {
    const { language, setLanguage, visualTheme, setVisualTheme, sidebarPushMode, setSidebarPushMode, aiSidebarPushMode, setAiSidebarPushMode } = useAppStore();
    const { t } = useI18n();
    const router = useRouter();

    // ---- CloudBase 账户 ----
    const [authUser, setAuthUser] = useState(null);
    const [authLoading, setAuthLoading] = useState(false);
    const [authError, setAuthError] = useState('');
    const [syncStatus, setSyncStatus] = useState(null);
    const [cloudBaseAvailable, setCloudBaseAvailable] = useState(false);

    useEffect(() => {
        // 动态加载 CloudBase 模块（避免未配置时报错）
        (async () => {
            try {
                const { isCloudBaseConfigured } = await import('../lib/cloudbase');
                if (!isCloudBaseConfigured) return;
                setCloudBaseAvailable(true);
                const { onAuthChange, initAuth } = await import('../lib/auth');
                const { onSyncStatusChange } = await import('../lib/cloudbase-sync');
                initAuth();
                onAuthChange(user => setAuthUser(user));
                onSyncStatusChange(status => setSyncStatus(status));
            } catch { /* CloudBase 未配置，忽略 */ }
        })();
    }, []);

    const handleSignOut = async () => {
        try {
            const { stopCloudSync } = await import('../lib/persistence');
            await stopCloudSync();
            const auth = await import('../lib/auth');
            await auth.signOut();
        } catch (err) {
            console.error('Sign out error:', err);
        }
    };

    // ---- 自定义提示词 ----
    const [customPrompt, setCustomPrompt] = useState('');
    const [promptSaveTimer, setPromptSaveTimer] = useState(null);
    const writingMode = getWritingMode();
    const defaultPrompt = getModeRolePrompt(writingMode);

    useEffect(() => {
        const settings = getProjectSettings();
        setCustomPrompt(settings.customPrompt || '');
    }, []);

    const handlePromptChange = (value) => {
        setCustomPrompt(value);
        // 500ms 防抖保存
        if (promptSaveTimer) clearTimeout(promptSaveTimer);
        const timer = setTimeout(() => {
            const settings = getProjectSettings();
            settings.customPrompt = value;
            saveProjectSettings(settings);
        }, 500);
        setPromptSaveTimer(timer);
    };

    const handleResetPrompt = () => {
        setCustomPrompt('');
        const settings = getProjectSettings();
        settings.customPrompt = '';
        saveProjectSettings(settings);
    };

    const layoutBtnStyle = (active) => ({
        flex: 1, padding: '10px 14px',
        border: active ? '2px solid var(--accent)' : '1px solid var(--border-light)',
        borderRadius: 'var(--radius-md)',
        background: active ? 'var(--accent-light)' : 'var(--bg-primary)',
        cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s',
        boxShadow: active ? '0 2px 8px var(--accent-glow)' : 'var(--shadow-sm)',
    });

    const [writingModeState, setWritingModeLocalState] = useState(getWritingMode());
    const { setWritingMode: setGlobalWritingMode } = useAppStore();

    return (
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>
                {t('preferences.intro')}
            </p>

            {/* ===== 云同步账户 ===== */}
            <div style={{ marginBottom: 28, padding: '20px 24px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-light)', background: 'var(--bg-secondary)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <Cloud size={16} style={{ color: 'var(--accent)' }} />
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>云同步</span>
                    {cloudBaseAvailable && authUser && (
                        <span style={{
                            fontSize: 11, padding: '2px 8px', borderRadius: 20,
                            background: 'rgba(34,197,94,0.1)', color: '#22c55e', fontWeight: 500,
                            marginLeft: 'auto',
                        }}>
                            <CheckCircle2 size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
                            已连接
                        </span>
                    )}
                </div>

                {!cloudBaseAvailable ? (
                    /* 未配置 CloudBase（本地离线模式） */
                    <div style={{
                        padding: '16px 20px', borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
                        display: 'flex', flexDirection: 'column', gap: 12,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                            <div style={{ padding: 8, background: 'var(--bg-secondary)', borderRadius: '50%', color: 'var(--text-muted)' }}>
                                <CloudOff size={20} />
                            </div>
                            <div>
                                <h4 style={{ margin: '0 0 6px 0', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>本地离线模式</h4>
                                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                    当前未配置云同步服务。您的所有数据都安全地保存在浏览器本地，不会上传到任何服务器。
                                    配置云同步后，可开启多设备之间的自动同步功能。
                                </p>
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                            <button
                                onClick={() => router.push('/login?next=/')}
                                style={{
                                    padding: '6px 14px', fontSize: 12, fontWeight: 500,
                                    background: 'var(--accent)', color: '#fff', border: 'none',
                                    borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                                    transition: 'all 0.2s', boxShadow: '0 2px 8px var(--accent-glow)'
                                }}
                                onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                                onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                            >
                                了解如何开启云同步
                            </button>
                        </div>
                    </div>
                ) : authUser ? (
                    /* 已登录状态 */
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                                {authUser.photoURL ? (
                                    <img src={authUser.photoURL} alt="" style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid var(--border-light)' }} />
                                ) : (
                                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', fontWeight: 700, fontSize: 15, border: '2px solid var(--border-light)' }}>
                                        {(authUser.email || '?')[0].toUpperCase()}
                                    </div>
                                )}
                                <div>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                                        {authUser.displayName || authUser.email}
                                    </div>
                                    {authUser.displayName && (
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{authUser.email}</div>
                                    )}
                                </div>
                            </div>

                            {/* 同步状态 */}
                            {syncStatus && (
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, padding: '6px 10px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)' }}>
                                    {syncStatus.syncing ? (
                                        <><RefreshCw size={11} style={{ marginRight: 4, animation: 'spin 1s linear infinite' }} />正在同步...</>
                                    ) : syncStatus.pending > 0 ? (
                                        <>{syncStatus.pending} 项待同步</>
                                    ) : syncStatus.lastSync ? (
                                        <><CheckCircle2 size={11} style={{ marginRight: 4, color: '#22c55e' }} />上次同步: {new Date(syncStatus.lastSync).toLocaleTimeString()}</>
                                    ) : null}
                                    {syncStatus.error && (
                                        <span style={{ color: '#ef4444', marginLeft: 8 }}>同步失败: {syncStatus.error}</span>
                                    )}
                                </div>
                            )}

                            <button
                                onClick={handleSignOut}
                                style={{
                                    padding: '6px 16px', fontSize: 12, border: '1px solid var(--border-light)',
                                    borderRadius: 'var(--radius-sm)', background: 'none', cursor: 'pointer',
                                    color: 'var(--text-muted)', transition: 'all 0.15s',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444'; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-light)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                            >
                                退出登录
                            </button>
                        </div>
                    ) : (
                        /* 未登录状态 */
                        <div>
                            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
                                登录后自动同步作品到云端，支持多设备访问。未登录时数据仅保存在本地。
                            </p>

                            {authError && (
                                <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 8, padding: '6px 10px', background: 'rgba(239,68,68,0.06)', borderRadius: 'var(--radius-sm)' }}>
                                    <XCircle size={12} style={{ marginRight: 4, verticalAlign: -1 }} />{authError}
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                                <button
                                    onClick={() => { setAuthError(''); router.push('/login?next=/'); }}
                                    disabled={authLoading}
                                    style={{
                                        flex: 1, padding: '8px 16px', fontSize: 13, fontWeight: 600,
                                        border: 'none', borderRadius: 'var(--radius-sm)',
                                        background: 'var(--accent)', color: '#fff', cursor: 'pointer',
                                        opacity: authLoading ? 0.5 : 1,
                                        transition: 'all 0.15s',
                                    }}
                                >
                                    登录云同步
                                </button>
                                <button
                                    onClick={() => { setAuthError(''); router.push('/register?next=/'); }}
                                    style={{
                                        padding: '8px 12px', fontSize: 12, border: '1px solid var(--border-light)',
                                        borderRadius: 'var(--radius-sm)', background: 'none', cursor: 'pointer',
                                        color: 'var(--text-muted)', transition: 'all 0.15s',
                                    }}
                                >
                                    注册账号
                                </button>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '12px 0' }}>
                                <div style={{ flex: 1, height: 1, background: 'var(--border-light)' }} />
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>说明</span>
                                <div style={{ flex: 1, height: 1, background: 'var(--border-light)' }} />
                            </div>

                            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                                当前 CloudBase 支持 <strong style={{ color: 'var(--text-primary)' }}>邮箱验证码</strong> 与 <strong style={{ color: 'var(--text-primary)' }}>微信登录</strong>。
                            </div>
                        </div>
                    )}
                </div>

            {/* 写作模式选择器 */}
            <div style={{ marginBottom: 28 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 12 }}>写作模式</label>
                <div style={{ display: 'flex', gap: 10 }}>
                    {Object.values(WRITING_MODES).map(m => (
                        <button
                            key={m.key}
                            className={`writing-mode-card ${writingModeState === m.key ? 'active' : ''}`}
                            style={{
                                border: writingModeState === m.key ? `2px solid ${m.color}` : '1px solid var(--border-light)',
                                background: writingModeState === m.key ? `${m.color}10` : 'var(--bg-primary)',
                            }}
                            onClick={() => { setWritingModeLocalState(m.key); setWritingMode(m.key); setGlobalWritingMode(m.key); }}
                        >
                            <div style={{ fontSize: 18, marginBottom: 4 }}>
                                {m.icon === 'smartphone' ? <Smartphone size={18} /> : m.icon === 'book-open' ? <BookOpen size={18} /> : m.icon === 'clapperboard' ? <Clapperboard size={18} /> : null}
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: writingModeState === m.key ? m.color : 'var(--text-primary)', marginBottom: 2 }}>{m.label}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>{m.desc}</div>
                        </button>
                    ))}
                </div>
            </div>

            <div style={{ marginBottom: 28 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 12 }}>{t('preferences.langLabel')}</label>
                <div style={{ display: 'flex', gap: 12 }}>
                    {['zh', 'en', 'ru'].map(lang => (
                        <button
                            key={lang}
                            style={{
                                flex: 1, padding: '12px 16px', border: language === lang ? '2px solid var(--accent)' : '1px solid var(--border-light)',
                                borderRadius: 'var(--radius-md)', background: language === lang ? 'var(--accent-light)' : 'var(--bg-primary)',
                                cursor: 'pointer', fontSize: 14, fontWeight: language === lang ? 600 : 400,
                                color: language === lang ? 'var(--accent)' : 'var(--text-primary)', transition: 'all 0.15s',
                                boxShadow: language === lang ? '0 2px 8px var(--accent-glow)' : 'var(--shadow-sm)'
                            }}
                            onClick={() => setLanguage(lang)}
                        >
                            {lang === 'zh' ? '🇨🇳 简体中文' : lang === 'en' ? '🇬🇧 English' : '🇷🇺 Русский'}
                        </button>
                    ))}
                </div>
            </div>

            <div style={{ marginBottom: 28 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 12 }}>{t('preferences.themeLabel')}</label>
                <div style={{ display: 'flex', gap: 16 }}>
                    {[{ id: 'warm', label: t('preferences.themeWarm'), desc: t('preferences.themeWarmDesc') }, { id: 'modern', label: t('preferences.themeModern'), desc: t('preferences.themeModernDesc') }].map(theme => (
                        <button
                            key={theme.id}
                            style={{
                                flex: 1, padding: '20px 16px', border: visualTheme === theme.id ? '2px solid var(--accent)' : '1px solid var(--border-light)',
                                borderRadius: 'var(--radius-lg)', background: visualTheme === theme.id ? 'var(--accent-light)' : 'var(--bg-primary)',
                                cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
                                boxShadow: visualTheme === theme.id ? '0 6px 16px var(--accent-glow)' : 'var(--shadow-sm)'
                            }}
                            onMouseEnter={e => { if (visualTheme !== theme.id) e.currentTarget.style.transform = 'translateY(-2px)' }}
                            onMouseLeave={e => { if (visualTheme !== theme.id) e.currentTarget.style.transform = 'none' }}
                            onClick={() => {
                                setVisualTheme(theme.id);
                                document.documentElement.setAttribute('data-visual', theme.id);
                            }}
                        >
                            <div style={{ fontSize: 15, fontWeight: 600, color: visualTheme === theme.id ? 'var(--accent)' : 'var(--text-primary)', marginBottom: 6 }}>
                                {theme.label}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{theme.desc}</div>
                        </button>
                    ))}
                </div>
            </div>

            {/* 布局模式 */}
            <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 16 }}>{t('preferences.layoutLabel')}</label>

                {/* 左侧章节列表 */}
                <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{t('preferences.sidebarLayoutLabel')}</div>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button style={layoutBtnStyle(!sidebarPushMode)} onClick={() => setSidebarPushMode(false)}>
                            <div style={{ fontSize: 13, fontWeight: !sidebarPushMode ? 600 : 400, color: !sidebarPushMode ? 'var(--accent)' : 'var(--text-primary)', marginBottom: 3 }}>
                                {t('preferences.layoutOverlay')}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('preferences.layoutOverlayDesc')}</div>
                        </button>
                        <button style={layoutBtnStyle(sidebarPushMode)} onClick={() => setSidebarPushMode(true)}>
                            <div style={{ fontSize: 13, fontWeight: sidebarPushMode ? 600 : 400, color: sidebarPushMode ? 'var(--accent)' : 'var(--text-primary)', marginBottom: 3 }}>
                                {t('preferences.layoutPush')}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('preferences.layoutPushDesc')}</div>
                        </button>
                    </div>
                </div>

                {/* 右侧 AI 助手 */}
                <div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{t('preferences.aiSidebarLayoutLabel')}</div>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button style={layoutBtnStyle(!aiSidebarPushMode)} onClick={() => setAiSidebarPushMode(false)}>
                            <div style={{ fontSize: 13, fontWeight: !aiSidebarPushMode ? 600 : 400, color: !aiSidebarPushMode ? 'var(--accent)' : 'var(--text-primary)', marginBottom: 3 }}>
                                {t('preferences.layoutOverlay')}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('preferences.layoutOverlayDesc')}</div>
                        </button>
                        <button style={layoutBtnStyle(aiSidebarPushMode)} onClick={() => setAiSidebarPushMode(true)}>
                            <div style={{ fontSize: 13, fontWeight: aiSidebarPushMode ? 600 : 400, color: aiSidebarPushMode ? 'var(--accent)' : 'var(--text-primary)', marginBottom: 3 }}>
                                {t('preferences.layoutPush')}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('preferences.layoutPushDesc')}</div>
                        </button>
                    </div>
                </div>
            </div>

            {/* 自定义系统提示词 */}
            <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
                        <Sparkles size={14} style={{ marginRight: 4 }} /> 自定义系统提示词
                    </label>
                    {customPrompt && (
                        <button
                            onClick={handleResetPrompt}
                            style={{
                                background: 'none', border: '1px solid var(--border-light)',
                                borderRadius: 'var(--radius-sm)', padding: '3px 10px',
                                cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)',
                                transition: 'all 0.15s',
                            }}
                            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
                            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                        >
                            ↩ 恢复默认
                        </button>
                    )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.5 }}>
                    自定义 AI 的角色设定和写作风格。留空则使用内置默认提示词（基于当前写作模式）。
                </div>
                <textarea
                    value={customPrompt}
                    onChange={e => handlePromptChange(e.target.value)}
                    placeholder={defaultPrompt}
                    rows={8}
                    style={{
                        width: '100%', padding: '12px 14px',
                        background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
                        borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
                        fontSize: 13, lineHeight: 1.6, resize: 'vertical',
                        fontFamily: 'inherit', outline: 'none', transition: 'border 0.15s',
                        minHeight: 120, maxHeight: 400,
                    }}
                    onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                    onBlur={e => e.currentTarget.style.borderColor = 'var(--border-light)'}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {customPrompt ? <><CheckCircle2 size={12} style={{ marginRight: 4, color: 'var(--success, #22c55e)' }} />使用自定义提示词</> : <><FileText size={12} style={{ marginRight: 4 }} />使用内置默认提示词</>}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {customPrompt.length} 字
                    </span>
                </div>
            </div>
        </div>
    );
}

function FieldInput({ label, value, onChange, placeholder, multiline, rows, secret }) {
    const [showSecret, setShowSecret] = useState(false);
    const Component = multiline ? 'textarea' : 'input';
    return (
        <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 5 }}>{label}</label>
            <div style={{ position: 'relative' }}>
                <Component
                    className="modal-input"
                    style={{ marginBottom: 0, ...(multiline ? { resize: 'vertical', minHeight: `${(rows || 3) * 22}px` } : {}), ...(secret ? { paddingRight: 36 } : {}) }}
                    {...(!multiline ? { type: secret && !showSecret ? 'password' : 'text', autoComplete: secret ? 'new-password' : 'off', 'data-lpignore': 'true', 'data-1p-ignore': 'true' } : {})}
                    value={value || ''}
                    onChange={e => onChange(e.target.value)}
                    placeholder={placeholder}
                    rows={rows || 3}
                />
                {secret && value && (
                    <button
                        type="button"
                        onClick={() => setShowSecret(!showSecret)}
                        style={{
                            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                            background: 'none', border: 'none', cursor: 'pointer',
                            fontSize: 14, color: 'var(--text-muted)', padding: '2px 4px',
                            opacity: 0.7, lineHeight: 1,
                        }}
                        title={showSecret ? '隐藏' : '显示'}
                    >
                        {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                )}
            </div>
        </div>
    );
}

function BookInfoForm({ data, onChange }) {
    const update = (field, value) => onChange({ ...data, [field]: value });
    const { t } = useI18n();
    return (
        <div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>{t('bookInfo.intro')}</p>
            <FieldInput label={t('bookInfo.title')} value={data.title} onChange={v => update('title', v)} placeholder={t('bookInfo.titlePlaceholder')} />
            <FieldInput label={t('bookInfo.genre')} value={data.genre} onChange={v => update('genre', v)} placeholder={t('bookInfo.genrePlaceholder')} />
            <FieldInput label={t('bookInfo.synopsis')} value={data.synopsis} onChange={v => update('synopsis', v)} placeholder={t('bookInfo.synopsisPlaceholder')} multiline rows={3} />
            <FieldInput label={t('bookInfo.style')} value={data.style} onChange={v => update('style', v)} placeholder={t('bookInfo.stylePlaceholder')} />
            <FieldInput label={t('bookInfo.tone')} value={data.tone} onChange={v => update('tone', v)} placeholder={t('bookInfo.tonePlaceholder')} />
            <FieldInput label={t('bookInfo.pov')} value={data.pov} onChange={v => update('pov', v)} placeholder={t('bookInfo.povPlaceholder')} />
            <FieldInput label={t('bookInfo.targetAudience')} value={data.targetAudience} onChange={v => update('targetAudience', v)} placeholder={t('bookInfo.targetAudiencePlaceholder')} />
        </div>
    );
}

function DeleteConfirmModal({ message, onConfirm, onCancel }) {
    const [skipToday, setSkipToday] = useState(false);
    const [neverRemind, setNeverRemind] = useState(false);
    const { t } = useI18n();

    const handleConfirm = () => {
        try {
            if (neverRemind) {
                localStorage.setItem('author-delete-never-remind', 'true');
            } else if (skipToday) {
                localStorage.setItem('author-delete-skip-today', new Date().toISOString().slice(0, 10));
            }
        } catch { /* ignore */ }
        onConfirm();
    };

    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 99999,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
            }}
            onClick={onCancel}
        >
            <div
                style={{
                    background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
                    borderRadius: 'var(--radius-lg, 12px)', padding: '24px 28px',
                    minWidth: 340, maxWidth: 440,
                    boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
                    animation: 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* 标题 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <span style={{ fontSize: 20 }}>⚠️</span>
                    <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {t('settings.deleteConfirmTitle')}
                    </span>
                </div>

                {/* 消息 */}
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 20px' }}>
                    {message}
                </p>

                {/* 复选框 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>
                        <input
                            type="checkbox" checked={skipToday} disabled={neverRemind}
                            onChange={e => setSkipToday(e.target.checked)}
                            style={{ accentColor: 'var(--accent)', width: 15, height: 15, cursor: 'pointer' }}
                        />
                        {t('settings.dontRemindToday')}
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>
                        <input
                            type="checkbox" checked={neverRemind}
                            onChange={e => { setNeverRemind(e.target.checked); if (e.target.checked) setSkipToday(false); }}
                            style={{ accentColor: 'var(--accent)', width: 15, height: 15, cursor: 'pointer' }}
                        />
                        {t('settings.dontRemindForever')}
                    </label>
                </div>

                {/* 按钮 */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                    <button
                        onClick={onCancel}
                        style={{
                            padding: '8px 20px', border: '1px solid var(--border-light)',
                            borderRadius: 'var(--radius-md, 8px)', background: 'var(--bg-secondary)',
                            cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500,
                            transition: 'all 0.15s',
                        }}
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        onClick={handleConfirm}
                        style={{
                            padding: '8px 20px', border: 'none',
                            borderRadius: 'var(--radius-md, 8px)', background: '#e53e3e',
                            cursor: 'pointer', fontSize: 13, color: '#fff', fontWeight: 600,
                            transition: 'all 0.15s',
                            boxShadow: '0 2px 8px rgba(229,62,62,0.3)',
                        }}
                    >
                        {t('common.delete')}
                    </button>
                </div>
            </div>
        </div>
    );
}
