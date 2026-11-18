
const {
  app,
  BrowserWindow,
  ipcMain,
  safeStorage
} = require("electron");

const path = require("path");
const fs = require("fs/promises");

const DEV_SERVER_URL = "http://127.0.0.1:5173";

const STORAGE_FILE = path.join(
  app.getPath("userData"),
  "active-conversation.dat"
);

// Only allow IPC requests from E.D.I.T.H's own renderer.
function verifyRenderer(event) {
  const url = event.senderFrame?.url || "";

  const trusted =
    url.startsWith(DEV_SERVER_URL) ||
    url.startsWith("file://");

  if (!trusted) {
    throw new Error("Unauthorized IPC request.");
  }
}

// Validate conversation IDs.
function validateConversationId(id) {
  return Number.isSafeInteger(id) && id > 0;
}

// Check asynchronous encryption availability.
async function ensureSecureStorage() {
  const available = await safeStorage.isAsyncEncryptionAvailable();

  if (!available) {
    throw new Error("Secure storage is unavailable.");
  }
}

// Get the encrypted active conversation ID.
ipcMain.handle(
  "edith:get-active-conversation",
  async (event) => {
    verifyRenderer(event);

    await ensureSecureStorage();

    try {
      const encryptedData = await fs.readFile(STORAGE_FILE);

      const decryptedData =
        await safeStorage.decryptStringAsync(encryptedData);

      const parsed = JSON.parse(decryptedData);

      if (!validateConversationId(parsed.conversationId)) {
        return null;
      }

      return parsed.conversationId;

    } catch (error) {
      if (error.code === "ENOENT") {
        return null;
      }

      throw error;
    }
  }
);

// Save the encrypted active conversation ID.
ipcMain.handle(
  "edith:set-active-conversation",
  async (event, conversationId) => {
    verifyRenderer(event);

    if (!validateConversationId(conversationId)) {
      throw new Error("Invalid conversation ID.");
    }

    await ensureSecureStorage();

    const data = JSON.stringify({
      conversationId
    });

    const encryptedData =
      await safeStorage.encryptStringAsync(data);

    await fs.writeFile(STORAGE_FILE, encryptedData);

    return true;
  }
);

// Clear the saved active conversation ID.
ipcMain.handle(
  "edith:clear-active-conversation",
  async (event) => {
    verifyRenderer(event);

    try {
      await fs.unlink(STORAGE_FILE);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }

    return true;
  }
);

// Create the application window.
function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#080B14",

    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({
    action: "deny"
  }));

  if (app.isPackaged) {
    mainWindow.loadFile(
      path.join(__dirname, "../dist/index.html")
    );
  } else {
    mainWindow.loadURL(DEV_SERVER_URL);
  }
}

// Application lifecycle.
app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
