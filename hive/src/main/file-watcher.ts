import { watch, type FSWatcher } from 'chokidar';
import { BrowserWindow } from 'electron';
import path from 'path';

let watcher: FSWatcher | null = null;

export function startWatching(thoughtsPath: string, mainWindow: BrowserWindow): void {
  stopWatching();

  watcher = watch(thoughtsPath, {
    ignored: /(^|[/\\])\../, // ignore dotfiles
    persistent: true,
    ignoreInitial: true,
    depth: 10,
    awaitWriteFinish: {
      stabilityThreshold: 300,
      pollInterval: 100,
    },
  });

  watcher.on('all', (event, filePath) => {
    // Only notify about markdown files
    if (path.extname(filePath) === '.md') {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('fs:file-changed', {
          path: filePath,
          event: event as 'add' | 'change' | 'unlink',
        });
      }
    }
  });
}

export function stopWatching(): void {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
}
