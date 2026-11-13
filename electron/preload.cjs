const { contextBridge, ipcRenderer, webUtils } = require("electron");

const on = (channel) => (fn) => {
  const handler = (_e, payload) => fn(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld("stash", {
  list: () => ipcRenderer.invoke("items:list"),
  capture: (input) => ipcRenderer.invoke("items:capture", input),
  captureClipboardImage: (note) => ipcRenderer.invoke("items:captureClipboardImage", note),
  update: (id, patch) => ipcRenderer.invoke("items:update", id, patch),
  archive: (id) => ipcRenderer.invoke("items:archive", id),
  reenrich: (id) => ipcRenderer.invoke("items:reenrich", id),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (patch) => ipcRenderer.invoke("settings:set", patch),
  readClipboard: () => ipcRenderer.invoke("clipboard:read"),
  openMain: (nav) => ipcRenderer.invoke("app:openMain", nav),
  petPeek: () => ipcRenderer.invoke("pet:peek"),
  onNavigate: on("ui:navigate"),
  openExternal: (url) => ipcRenderer.invoke("app:openExternal", url),
  reveal: (p) => ipcRenderer.invoke("app:reveal", p),
  openFile: (p) => ipcRenderer.invoke("app:openFile", p),
  filePath: (file) => webUtils.getPathForFile(file),
  petMoveBy: (dx, dy) => ipcRenderer.send("pet:moveBy", dx, dy),
  petSetOpen: (open) => ipcRenderer.send("pet:setOpen", open),
  petWander: () => ipcRenderer.send("pet:wander"),
  petFit: (w, h) => ipcRenderer.send("pet:fit", w, h),
  petStopWalk: () => ipcRenderer.send("pet:stopWalk"),
  onWalk: on("pet:walk"),
  onHover: on("pet:hover"),
  onItemsChanged: on("items:changed"),
  onSettingsChanged: on("settings:changed"),
  onQuickCapture: on("pet:quickCapture"),
  onFed: on("pet:fed"),
  isElectron: true,
});
