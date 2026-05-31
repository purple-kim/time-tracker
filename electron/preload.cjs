const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAgent", {
  moveWindowBy(delta) {
    ipcRenderer.send("move-window-by", delta);
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
