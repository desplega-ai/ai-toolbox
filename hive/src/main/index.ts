// Fix PATH for macOS apps launched from Finder (must be first)
import fixPath from 'fix-path';
fixPath();

import { app, BrowserWindow, Tray, Menu, nativeImage } from 'electron';
import path from 'path';
import windowStateKeeper from 'electron-window-state';
import { updateElectronApp } from 'update-electron-app';
import { registerIpcHandlers } from './ipc-handlers';
import { database } from './database';

// Check for updates (works with GitHub Releases)
updateElectronApp({
  updateInterval: '1 hour',
  notifyUser: true,
});

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function getResourcePath(filename: string): string {
  // In development, resources are in the project root
  // In production, they're in the app's resources folder
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    return path.join(__dirname, '../../resources', filename);
  }
  return path.join(process.resourcesPath, filename);
}

function getIconFilename(): string {
  return !app.isPackaged ? 'icon-dev.png' : 'icon.png';
}

function createTray(): void {
  const trayIcon = nativeImage.createFromPath(getResourcePath(getIconFilename()));
  // Resize for menu bar (macOS expects ~18x18 for standard, @2x for retina)
  const resizedIcon = trayIcon.resize({ width: 18, height: 18 });
  resizedIcon.setTemplateImage(true); // Makes it adapt to dark/light menu bar

  tray = new Tray(resizedIcon);
  tray.setToolTip('Hive');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Hive',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
      }
    }
  });
}

function createWindow(): void {
  const mainWindowState = windowStateKeeper({
    defaultWidth: 1400,
    defaultHeight: 900,
  });

  mainWindow = new BrowserWindow({
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,
    show: false,
    minWidth: 800,
    minHeight: 600,
    resizable: true,
    movable: true,

    // macOS-specific
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 10 },

    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindowState.manage(mainWindow);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Register IPC handlers
  registerIpcHandlers(mainWindow);

  // Load app
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }
}

app.whenReady().then(() => {
  // Set dock icon (for dev mode - production uses packagerConfig)
  if (process.platform === 'darwin') {
    const dockIcon = nativeImage.createFromPath(getResourcePath(getIconFilename()));
    if (!dockIcon.isEmpty()) {
      app.dock?.setIcon(dockIcon);
    }
  }

  createTray();
  createWindow();
});

app.on('window-all-closed', () => {
  database.close();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
