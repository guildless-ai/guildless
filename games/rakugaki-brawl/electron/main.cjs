// Electron shell for Rakugaki Brawl. Loads the Vite build (dist/) and offers a
// second always-on-top, frameless strip window for idle mode so the game can
// sit at the bottom of a second monitor while you work.
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('node:path');

const DIST = path.join(__dirname, '..', 'dist', 'index.html');
let mainWin = null;
let idleWin = null;

function createMain() {
  mainWin = new BrowserWindow({
    width: 1200,
    height: 820,
    title: 'らくがきブロウル',
    backgroundColor: '#f7f3e8',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true },
  });
  mainWin.setMenuBarVisibility(false);
  mainWin.loadFile(DIST);
  mainWin.on('closed', () => { mainWin = null; });
}

/** Thin strip docked to the bottom of the display the main window is on. */
function openIdleWindow() {
  if (idleWin) { idleWin.focus(); return; }
  const display = mainWin ? screen.getDisplayMatching(mainWin.getBounds()) : screen.getPrimaryDisplay();
  const { x, y, width, height } = display.workArea;
  const stripH = 260;
  idleWin = new BrowserWindow({
    x, y: y + height - stripH, width, height: stripH,
    frame: false,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: false,
    backgroundColor: '#f7f3e8',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true },
  });
  idleWin.setAlwaysOnTop(true, 'floating');
  idleWin.loadFile(DIST, { query: { idle: '1' } });
  idleWin.on('closed', () => { idleWin = null; });
}

ipcMain.on('rakugaki:open-idle', openIdleWindow);
ipcMain.on('rakugaki:close-idle', () => { if (idleWin) idleWin.close(); });

app.whenReady().then(() => {
  createMain();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createMain(); });
  // Smoke mode for automated checks: load both windows, report, quit.
  if (process.env.RAKUGAKI_SMOKE) {
    mainWin.webContents.once('did-finish-load', async () => {
      const title = await mainWin.webContents.executeJavaScript('document.title');
      const mode = await mainWin.webContents.executeJavaScript('document.getElementById("rendermode").textContent');
      const btn = await mainWin.webContents.executeJavaScript('document.getElementById("idlewindow").hidden');
      openIdleWindow();
      idleWin.webContents.once('did-finish-load', async () => {
        const idle = await idleWin.webContents.executeJavaScript('document.body.classList.contains("idle") || document.getElementById("log").textContent');
        const [w, h] = idleWin.getSize();
        console.log(JSON.stringify({ smoke: true, title, mode, desktopButtonHidden: btn, idleWindow: { w, h, alwaysOnTop: idleWin.isAlwaysOnTop(), idle } }));
        setTimeout(() => app.quit(), 300);
      });
    });
  }
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
