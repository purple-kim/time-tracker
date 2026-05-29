const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAgent", {
  moveWindowBy(delta) {
    ipcRenderer.send("move-window-by", delta);
  }
});
