const { app, BrowserWindow, ipcMain, screen } = require("electron");
const path = require("node:path");

const WINDOW_WIDTH = 320;
const WINDOW_HEIGHT = 520;

let mainWindow;

function getInitialBounds() {
  const { workArea } = screen.getPrimaryDisplay();
  return {
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    x: Math.round(workArea.x + workArea.width - WINDOW_WIDTH - 56),
    y: Math.round(workArea.y + workArea.height - WINDOW_HEIGHT - 56)
  };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    ...getInitialBounds(),
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    frame: false,
    hasShadow: false,
    resizable: false,
    show: false,
    transparent: true,
    title: "Time Tracker",
    trafficLightPosition: { x: -100, y: -100 },
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "preload.cjs")
    }
  });

  mainWindow.setAlwaysOnTop(true, "floating");
  mainWindow.loadFile(path.join(__dirname, "..", "index.html"), {
    query: { desktop: "1", v: "desktop" }
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
}

app.whenReady().then(createWindow);

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.on("move-window-by", (_event, delta) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const bounds = mainWindow.getBounds();
  mainWindow.setBounds({
    ...bounds,
    x: Math.round(bounds.x + delta.x),
    y: Math.round(bounds.y + delta.y)
  });
});
