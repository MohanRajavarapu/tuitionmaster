const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

// Set up a secure data folder in the native OS Documents directory
const userDataPath = path.join(app.getPath('documents'), 'TuitionMasterData');
const dbFilePath = path.join(userDataPath, 'system_db.json');

// Verify directory architecture presence on boot
if (!fs.existsSync(userDataPath)) {
  fs.mkdirSync(userDataPath, { recursive: true });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1250,
    height: 850,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');
  // mainWindow.webContents.openDevTools(); // Uncomment during local active debugging
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ─── IPC CORE SECURE PERSISTENCE HANDLERS ───

ipcMain.handle('read-database', () => {
  if (!fs.existsSync(dbFilePath)) {
    return null; // Signals client engine initialization sequence needed
  }
  try {
    const rawData = fs.readFileSync(dbFilePath, 'utf8');
    return JSON.parse(rawData);
  } catch (error) {
    console.error("Database structural read read error:", error);
    return null;
  }
});

ipcMain.handle('write-database', (event, dataPayload) => {
  try {
    fs.writeFileSync(dbFilePath, JSON.stringify(dataPayload, null, 2), 'utf8');
    return { success: true };
  } catch (error) {
    console.error("Database structural write hazard:", error);
    return { success: false, error: error.message };
  }
});

// ─── THE ANTI-SUPPORT "HARD RESET / CACHE PURGE" CONTROLLER ───
ipcMain.handle('purge-database', () => {
  try {
    if (fs.existsSync(dbFilePath)) {
      fs.unlinkSync(dbFilePath);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});