
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("edith", {
  platform: process.platform,
  appName: "E.D.I.T.H",
  version: "0.1.0",

  // Secure active conversation storage
  getActiveConversation: () =>
    ipcRenderer.invoke("edith:get-active-conversation"),

  setActiveConversation: (conversationId) =>
    ipcRenderer.invoke(
      "edith:set-active-conversation",
      conversationId
    ),

  clearActiveConversation: () =>
    ipcRenderer.invoke("edith:clear-active-conversation")
});
