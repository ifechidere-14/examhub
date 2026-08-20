const { app, BrowserWindow } = require('electron');

const defaultAppUrl = 'https://examhub.onrender.com';

function getAppUrl() {
  const appUrlArgument = process.argv.find((argument) => argument.startsWith('--app-url='));
  return appUrlArgument ? appUrlArgument.slice('--app-url='.length) : process.env.EXAMHUB_APP_URL || defaultAppUrl;
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 640,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.loadURL(getAppUrl());
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});