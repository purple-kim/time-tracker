const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAgent", {
  moveWindowBy(delta) {
    ipcRenderer.send("move-window-by", delta);
  },
  setWindowMode(mode) {
    ipcRenderer.send("window:set-mode", mode);
  },
  showContextMenu(state) {
    ipcRenderer.send("context-menu:show", state);
  },
  onContextMenuCommand(callback) {
    const listener = (_event, command) => callback(command);
    ipcRenderer.on("context-menu:command", listener);
    return () => ipcRenderer.removeListener("context-menu:command", listener);
  },
  quitApp() {
    ipcRenderer.send("app:quit");
  },
  getCalendarState() {
    return ipcRenderer.invoke("calendar:get-state");
  },
  connectCalendar() {
    return ipcRenderer.invoke("calendar:connect");
  },
  disconnectCalendar() {
    return ipcRenderer.invoke("calendar:disconnect");
  },
  refreshCalendar() {
    return ipcRenderer.invoke("calendar:refresh");
  }
});
