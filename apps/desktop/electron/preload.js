
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("edith", {
  platform: process.platform,
  appName: "E.D.I.T.H",
  version: "0.1.0"
});
