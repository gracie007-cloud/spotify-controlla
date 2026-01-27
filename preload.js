const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  callSpotify: (buffer) => ipcRenderer.invoke("callSpotify", buffer),
  readCredentials: (key) => ipcRenderer.invoke("getCredentials", key),

  addCredentials: (key, value) => ipcRenderer.invoke("setCredentials", key, value),

  reconnectSpotify: () => ipcRenderer.invoke("reconnectSpotify")
});