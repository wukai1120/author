const { app, BrowserWindow, shell, dialog, ipcMain } = require('electron');
const path = require('path');
const { fork, execSync } = require('child_process');
const http = require('http');
const net = require('net');
const fs = require('fs');

// 加载 .env.local（轻量实现，无需 dotenv 依赖）
(function loadEnvFile() {
    const envPaths = [
        path.join(__dirname, '..', '.env.local'),
        path.join(__dirname, '..', '.env'),
    ];
    for (const envPath of envPaths) {
        if (fs.existsSync(envPath)) {
            const lines = fs.readFileSync(envPath, 'utf8').split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) continue;
                const eqIdx = trimmed.indexOf('=');
                if (eqIdx === -1) continue;
                const key = trimmed.slice(0, eqIdx).trim();
                const value = trimmed.slice(eqIdx + 1).trim();
                if (key && !process.env[key]) {
                    process.env[key] = value;
                }
            }
            break; // 只加载第一个找到的文件
        }
    }
})();

// 日志文件 - 写到应用安装根目录（exe 同级），方便查找
const logFile = path.join(path.dirname(process.execPath), 'author-debug.log');
function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    console.log(msg);
    try { fs.appendFileSync(logFile, line); } catch (e) { }
}

// 防止多开
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    log('Another instance is running, quitting.');
    app.quit();
    process.exit(0);
}

let mainWindow;
let serverProcess;

const isDev = process.argv.includes('--dev');
const BASE_PORT = parseInt(process.env.PORT, 10) || 3000;
let actualPort = BASE_PORT;
let loadRetries = 0;
const MAX_LOAD_RETRIES = 10;
let serverReady = false; // 追踪服务器是否真正就绪

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 900,
        minHeight: 600,
        title: 'Author — AI-Powered Creative Writing',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        autoHideMenuBar: true,
        show: false,
    });

    mainWindow.loadURL(`http://localhost:${actualPort}`);

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        // F12 打开开发者工具
        mainWindow.webContents.on('before-input-event', (event, input) => {
            if (input.key === 'F12') {
                mainWindow.webContents.toggleDevTools();
            }
        });
    });

    // 加载失败时有限次重试
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        loadRetries++;
        log(`Load failed (${loadRetries}/${MAX_LOAD_RETRIES}): ${errorDescription}`);
        if (loadRetries < MAX_LOAD_RETRIES) {
            setTimeout(() => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.loadURL(`http://localhost:${actualPort}`);
                }
            }, 2000);
        } else {
            mainWindow.show();
            dialog.showErrorBox(
                'Author 启动失败',
                '无法连接到内置服务器。\n\n' +
                '查看日志: ' + logFile
            );
        }
    });

    // 只有真正加载了 localhost 页面才重置重试计数器
    mainWindow.webContents.on('did-finish-load', () => {
        const url = mainWindow.webContents.getURL();
        if (url.includes('localhost')) {
            log('Page loaded successfully: ' + url);
            loadRetries = 0;
        }
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http') && !url.includes('localhost')) {
            shell.openExternal(url);
            return { action: 'deny' };
        }
        return { action: 'allow' };
    });

    // 确保下载文件使用正确的文件名（而非 blob UUID）
    mainWindow.webContents.session.on('will-download', (event, item) => {
        const suggestedName = item.getFilename();
        // 如果文件名看起来像 UUID（没有扩展名或是 blob hash），尝试用 Content-Disposition
        if (suggestedName && !suggestedName.match(/^[0-9a-f-]{36}/i)) {
            // 文件名正常，不需要干预
            return;
        }
        // Electron 有时已经能从 a.download 获取到正确名称，这里做兜底
        log(`[Download] Original filename: ${suggestedName}`);
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// 检测端口是否可用
function isPortAvailable(port) {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', () => resolve(false));
        server.once('listening', () => {
            server.close(() => resolve(true));
        });
        server.listen(port, '127.0.0.1');
    });
}

// 查找可用端口
async function findAvailablePort(startPort, maxTries = 10) {
    for (let i = 0; i < maxTries; i++) {
        const port = startPort + i;
        if (await isPortAvailable(port)) {
            return port;
        }
        log(`Port ${port} is in use, trying next...`);
    }
    return null;
}

// 尝试杀掉占用端口的进程 (Windows)
function tryKillPortProcess(port) {
    try {
        if (process.platform === 'win32') {
            const result = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: 'utf8', timeout: 5000 });
            const lines = result.trim().split('\n');
            for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                const pid = parts[parts.length - 1];
                if (pid && pid !== '0') {
                    log(`Killing process ${pid} on port ${port}`);
                    try { execSync(`taskkill /F /PID ${pid}`, { timeout: 5000 }); } catch (e) { }
                }
            }
        }
    } catch (e) {
        // 没有进程占用或命令失败，忽略
    }
}

function waitForServer(port, maxRetries = 60) {
    return new Promise((resolve) => {
        let retries = 0;
        const check = () => {
            const req = http.get(`http://localhost:${port}`, (res) => {
                resolve(true);
            });
            req.on('error', () => {
                retries++;
                if (retries >= maxRetries) {
                    resolve(false);
                } else {
                    setTimeout(check, 1000);
                }
            });
            req.setTimeout(3000, () => {
                req.destroy();
                retries++;
                if (retries >= maxRetries) {
                    resolve(false);
                } else {
                    setTimeout(check, 1000);
                }
            });
        };
        check();
    });
}

function startNextServer() {
    return new Promise(async (resolve) => {
        if (isDev) {
            log('Dev mode — connecting to existing dev server...');
            resolve(true);
            return;
        }

        const isPackaged = app.isPackaged;
        let standaloneDir;

        if (isPackaged) {
            standaloneDir = path.join(process.resourcesPath, 'standalone');
        } else {
            standaloneDir = path.join(__dirname, '..', '.next', 'standalone');
        }

        const serverPath = path.join(standaloneDir, 'server.js');

        log(`isPackaged: ${isPackaged}`);
        log(`resourcesPath: ${process.resourcesPath}`);
        log(`standaloneDir: ${standaloneDir}`);
        log(`serverPath: ${serverPath}`);
        log(`serverExists: ${fs.existsSync(serverPath)}`);

        // 检查关键目录
        const staticDir = path.join(standaloneDir, '.next', 'static');
        const publicDir = path.join(standaloneDir, 'public');
        log(`staticDir exists: ${fs.existsSync(staticDir)}`);
        log(`publicDir exists: ${fs.existsSync(publicDir)}`);

        if (!fs.existsSync(serverPath)) {
            const msg = '找不到 server.js\n路径: ' + serverPath;
            log('ERROR: ' + msg);
            dialog.showErrorBox('Author 启动失败', msg);
            resolve(false);
            return;
        }

        // 尝试释放被占用的端口
        tryKillPortProcess(BASE_PORT);

        // 等待一下让端口释放
        await new Promise(r => setTimeout(r, 500));

        // 查找可用端口
        actualPort = await findAvailablePort(BASE_PORT);
        if (!actualPort) {
            const msg = `端口 ${BASE_PORT}-${BASE_PORT + 9} 全部被占用，无法启动服务器。`;
            log('ERROR: ' + msg);
            dialog.showErrorBox('Author 启动失败', msg);
            resolve(false);
            return;
        }

        log(`Using port: ${actualPort}`);
        log('Starting Next.js server via fork...');

        serverProcess = fork(serverPath, [], {
            cwd: standaloneDir,
            env: {
                ...process.env,
                NODE_ENV: 'production',
                PORT: String(actualPort),
                HOSTNAME: '0.0.0.0',
                // 提高请求体大小限制（50MB），避免上传大 PDF/DOC 文件时返回 413
                BODY_SIZE_LIMIT: '52428800',
            },
            stdio: 'pipe',
        });

        serverProcess.stdout.on('data', (data) => {
            log('[Next.js stdout] ' + data.toString().trim());
        });

        serverProcess.stderr.on('data', (data) => {
            log('[Next.js stderr] ' + data.toString().trim());
        });

        serverProcess.on('error', (err) => {
            log('[Server process error] ' + err.message);
        });

        serverProcess.on('close', (code) => {
            log('[Server process closed] code: ' + code);
            serverReady = false;
        });

        const ready = await waitForServer(actualPort);
        serverReady = ready;
        log(`Server ready: ${ready}`);
        resolve(ready);
    });
}

app.whenReady().then(async () => {
    log('=== Author Desktop Starting ===');
    log(`Electron version: ${process.versions.electron}`);
    log(`Node version: ${process.versions.node}`);
    log(`Platform: ${process.platform} ${process.arch}`);
    log(`App path: ${app.getAppPath()}`);
    log(`Exe path: ${process.execPath}`);

    const ready = await startNextServer();

    if (!ready) {
        log('Server failed to start. Showing error dialog.');
        dialog.showErrorBox(
            'Author 启动失败',
            '内置服务器无法启动。\n\n' +
            '可能原因：\n' +
            '1. 端口被其他程序占用\n' +
            '2. 缺少运行文件\n' +
            '3. 防火墙或杀毒软件拦截\n\n' +
            '查看日志: ' + logFile
        );
        app.quit();
        return;
    }

    createWindow();
    setupAutoUpdater();
});

// ==================== 自动更新 (electron-updater) ====================

function setupAutoUpdater() {
    // electron-updater 仅在打包后可用
    if (isDev || !app.isPackaged) {
        log('Dev mode — skipping auto-updater setup');
        return;
    }

    let autoUpdater;
    try {
        autoUpdater = require('electron-updater').autoUpdater;
    } catch (err) {
        log('Failed to load electron-updater: ' + err.message);
        return;
    }

    // 配置
    autoUpdater.autoDownload = false;        // 不自动下载，等用户确认
    autoUpdater.autoInstallOnAppQuit = true;  // 退出时自动安装已下载的更新
    autoUpdater.logger = { info: log, warn: log, error: log, debug: log };

    // ---- 事件转发到渲染进程 ----
    autoUpdater.on('update-available', (info) => {
        log(`Update available: v${info.version}`);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update-available', {
                version: info.version,
                releaseDate: info.releaseDate,
            });
        }
    });

    autoUpdater.on('update-not-available', () => {
        log('No update available');
    });

    autoUpdater.on('download-progress', (progress) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update-download-progress', {
                progress: Math.floor(progress.percent),
                bytesPerSecond: progress.bytesPerSecond,
                downloaded: progress.transferred,
                total: progress.total,
            });
        }
    });

    autoUpdater.on('update-downloaded', (info) => {
        log(`Update downloaded: v${info.version}`);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update-downloaded', {
                version: info.version,
            });
        }
    });

    autoUpdater.on('error', (err) => {
        log('Auto-updater error: ' + err.message);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update-error', {
                error: err.message,
            });
        }
    });

    // ---- IPC 处理 ----
    ipcMain.handle('check-for-update', async () => {
        try {
            const result = await autoUpdater.checkForUpdates();
            return { success: true, version: result?.updateInfo?.version };
        } catch (err) {
            log('Check update error: ' + err.message);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('download-update', async () => {
        try {
            await autoUpdater.downloadUpdate();
            return { success: true };
        } catch (err) {
            log('Download update error: ' + err.message);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('quit-and-install', () => {
        log('User requested quit-and-install');
        if (serverProcess) {
            serverProcess.kill();
            serverProcess = null;
        }
        autoUpdater.quitAndInstall(false, true); // isSilent=false, isForceRunAfter=true
    });

    // 窗口显示后 5 秒自动检查一次更新
    setTimeout(() => {
        log('Auto-checking for updates...');
        autoUpdater.checkForUpdates().catch(err => {
            log('Auto-check update failed: ' + err.message);
        });
    }, 5000);
}

app.on('second-instance', () => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    }
});

app.on('window-all-closed', () => {
    if (serverProcess) serverProcess.kill();
    app.quit();
});

app.on('before-quit', () => {
    if (serverProcess) serverProcess.kill();
});
