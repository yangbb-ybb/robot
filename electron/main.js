const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

app.commandLine.appendSwitch('no-sandbox');
// 3D model-viewer 依赖 WebGL；不能禁用 GPU，否则模型会加载但无法渲染。

let mainWindow;
let tray;
let serverProcess;
let compactMode = false;
let normalBounds = { width: 1180, height: 760 };
const settingsFile = path.join(app.getPath('userData'), 'settings.json');
let settings = { alwaysOnTop: false };

function loadSettings() {
  try { settings = { ...settings, ...JSON.parse(require('fs').readFileSync(settingsFile, 'utf8')) }; } catch {}
}

function saveSettings() {
  require('fs').mkdirSync(path.dirname(settingsFile), { recursive: true });
  require('fs').writeFileSync(settingsFile, JSON.stringify(settings, null, 2), 'utf8');
}

function setAlwaysOnTop(value) {
  settings.alwaysOnTop = Boolean(value);
  if (mainWindow) mainWindow.setAlwaysOnTop(settings.alwaysOnTop);
  saveSettings();
  if (tray) createTrayMenu();
}

function setCompactMode(value) {
  compactMode = Boolean(value);
  if (!mainWindow) return compactMode;
  if (compactMode) {
    normalBounds = mainWindow.getBounds();
    if (process.platform === 'darwin' && mainWindow.setWindowButtonVisibility) mainWindow.setWindowButtonVisibility(false);
    mainWindow.setBackgroundColor('#00000000');
    mainWindow.setAlwaysOnTop(true);
    mainWindow.setResizable(false);
    mainWindow.setMinimumSize(280, 300);
    mainWindow.setSize(360, 400);
    const workArea = screen.getPrimaryDisplay().workArea;
    mainWindow.setPosition(workArea.x + workArea.width - 380, workArea.y + workArea.height - 420);
    mainWindow.setSkipTaskbar(true);
    mainWindow.webContents.send('window:mode-changed', 'compact');
  } else {
    if (process.platform === 'darwin' && mainWindow.setWindowButtonVisibility) mainWindow.setWindowButtonVisibility(true);
    mainWindow.setBackgroundColor('#11151a');
    mainWindow.setSkipTaskbar(false);
    mainWindow.setResizable(true);
    mainWindow.setMinimumSize(860, 620);
    mainWindow.setSize(normalBounds.width, normalBounds.height);
    mainWindow.center();
    mainWindow.setAlwaysOnTop(settings.alwaysOnTop);
    mainWindow.webContents.send('window:mode-changed', 'normal');
  }
  createTrayMenu();
  return compactMode;
}

function startBackend() {
  return new Promise((resolve, reject) => {
    serverProcess = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'inherit', 'inherit']
    });
    const startedAt = Date.now();
    const check = () => {
      const request = http.get('http://127.0.0.1:3000/api/health', (response) => {
        response.resume();
        if (response.statusCode === 200) return resolve();
        retry();
      });
      request.on('error', retry);
      request.setTimeout(500, () => { request.destroy(); retry(); });
    };
    const retry = () => {
      if (Date.now() - startedAt > 10000) return reject(new Error('后端启动超时'));
      setTimeout(check, 100);
    };
    serverProcess.once('error', reject);
    check();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 860,
    minHeight: 620,
    show: false,
    alwaysOnTop: settings.alwaysOnTop,
    title: '3D 智能聊天助手',
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    // 使用隐藏标题栏，让页面自己的顶部栏覆盖整个窗口，避免 macOS 原生透明标题区露出桌面。
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 10 },
    visualEffectState: 'active',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadURL('http://127.0.0.1:3000/');
  if (process.platform === 'darwin' && mainWindow.setWindowButtonVisibility) mainWindow.setWindowButtonVisibility(true);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  // 点击窗口左上角关闭按钮时真正退出，避免用户以为已经退出但进程仍驻留。
  mainWindow.on('close', () => {
    if (!app.isQuitting) {
      app.isQuitting = true;
      app.quit();
    }
  });
}

function createTrayMenu() {
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setMenu(Menu.buildFromTemplate([
      { label: '切换到机器人悬浮模式', enabled: !compactMode, click: () => setCompactMode(true) },
      { label: '恢复完整聊天窗口', enabled: compactMode, click: () => { setCompactMode(false); mainWindow.show(); mainWindow.focus(); } }
    ]));
  }
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示助手', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { label: '隐藏窗口', click: () => mainWindow.hide() },
    { type: 'separator' },
    { label: '窗口置顶', type: 'checkbox', checked: settings.alwaysOnTop, click: (item) => setAlwaysOnTop(item.checked) },
    { label: '切换到机器人悬浮模式', enabled: !compactMode, click: () => setCompactMode(true) },
    { label: '恢复完整聊天窗口', enabled: compactMode, click: () => setCompactMode(false) },
    { type: 'separator' },
    { label: '退出', click: () => { app.isQuitting = true; app.quit(); } }
  ]));
}

function createTray() {
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip('3D 智能聊天助手');
  createTrayMenu();
  tray.on('double-click', () => { mainWindow.show(); mainWindow.focus(); });
}

ipcMain.handle('window:get-always-on-top', () => settings.alwaysOnTop);
ipcMain.handle('window:set-always-on-top', (_event, value) => {
  setAlwaysOnTop(value);
  return settings.alwaysOnTop;
});
ipcMain.handle('window:get-mode', () => compactMode);
ipcMain.handle('window:set-mode', (_event, value) => setCompactMode(value));

app.whenReady().then(async () => {
  loadSettings();
  try {
    await startBackend();
    createWindow();
    createTray();
  } catch (error) {
    const errorWindow = new BrowserWindow({ width: 560, height: 260, title: '启动失败', backgroundColor: '#0c171b' });
    errorWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<body style="font-family:sans-serif;padding:28px;background:#0c171b;color:#e8f3f3"><h2>后端启动失败</h2><p>${error.message}</p><p>请关闭程序后重试。</p></body>`)}`);
  }
});

app.on('window-all-closed', (event) => event.preventDefault());
app.on('before-quit', () => {
  app.isQuitting = true;
  if (serverProcess && !serverProcess.killed) serverProcess.kill();
});
