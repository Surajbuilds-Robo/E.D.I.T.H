
const {
  app,
  BrowserWindow,
  ipcMain,
  safeStorage,
  Tray,
  Menu,
  nativeImage,
  shell
} = require("electron");

const path = require("path");
const fs = require("fs/promises");
const crypto = require("crypto");

const DEV_SERVER_URL = "http://127.0.0.1:5173";

const USER_DATA = app.getPath("userData");

const CONVERSATION_FILE = path.join(
  USER_DATA,
  "active-conversation.dat"
);

const AUTH_SESSION_FILE = path.join(
  USER_DATA,
  "auth-session.dat"
);

const DEVICE_ID_FILE = path.join(
  USER_DATA,
  "device-id.dat"
);

// ======================================
// SECURITY HELPERS
// ======================================

function verifyRenderer(event) {
  const url = event.senderFrame?.url || "";

  const trusted =
    url.startsWith(DEV_SERVER_URL) ||
    url.startsWith("file://");

  if (!trusted) {
    throw new Error("Unauthorized IPC request.");
  }
}

function validateConversationId(id) {
  return Number.isSafeInteger(id) && id > 0;
}

function validateAuthSession(session) {
  return (
    session !== null &&
    typeof session === "object" &&
    typeof session.access_token === "string" &&
    session.access_token.length >= 20 &&
    session.access_token.length <= 16384 &&
    !/\s/.test(session.access_token) &&
    typeof session.refresh_token === "string" &&
    session.refresh_token.length >= 32 &&
    session.refresh_token.length <= 256 &&
    !/\s/.test(session.refresh_token) &&
    Number.isSafeInteger(session.session_id) &&
    session.session_id > 0
  );
}

async function ensureSecureStorage() {
  const available =
    await safeStorage.isAsyncEncryptionAvailable();

  if (!available) {
    throw new Error("Secure storage is unavailable.");
  }
}

async function readEncryptedFile(filePath) {
  try {
    return await fs.readFile(filePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function writeEncryptedFile(filePath, data) {
  await ensureSecureStorage();

  const encryptedData =
    await safeStorage.encryptStringAsync(data);

  const temporaryFile = `${filePath}.tmp`;

  await fs.writeFile(temporaryFile, encryptedData, {
    mode: 0o600
  });

  await fs.rename(temporaryFile, filePath);
}

async function removeFile(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

// ======================================
// ACTIVE CONVERSATION STORAGE
// ======================================

ipcMain.handle(
  "edith:get-active-conversation",
  async (event) => {
    verifyRenderer(event);
    await ensureSecureStorage();

    const encryptedData = await readEncryptedFile(
      CONVERSATION_FILE
    );

    if (!encryptedData) {
      return null;
    }

    try {
      const decryptedData =
        await safeStorage.decryptStringAsync(encryptedData);

      const parsed = JSON.parse(decryptedData);

      if (!validateConversationId(parsed.conversationId)) {
        return null;
      }

      return parsed.conversationId;
    } catch {
      await removeFile(CONVERSATION_FILE);
      return null;
    }
  }
);

ipcMain.handle(
  "edith:set-active-conversation",
  async (event, conversationId) => {
    verifyRenderer(event);

    if (!validateConversationId(conversationId)) {
      throw new Error("Invalid conversation ID.");
    }

    await writeEncryptedFile(
      CONVERSATION_FILE,
      JSON.stringify({ conversationId })
    );

    return true;
  }
);

ipcMain.handle(
  "edith:clear-active-conversation",
  async (event) => {
    verifyRenderer(event);

    await removeFile(CONVERSATION_FILE);

    return true;
  }
);

ipcMain.handle(
  "edith:get-device-id",
  async (event) => {
    verifyRenderer(event);
    await ensureSecureStorage();

    const encryptedData = await readEncryptedFile(DEVICE_ID_FILE);
    if (encryptedData) {
      try {
        const decrypted = await safeStorage.decryptStringAsync(encryptedData);
        if (typeof decrypted === "string" && decrypted.length >= 16) {
          return decrypted;
        }
      } catch {
        // Fall back to generating a fresh ID below
      }
    }

    const newDeviceId = crypto.randomUUID();
    await writeEncryptedFile(DEVICE_ID_FILE, newDeviceId);
    return newDeviceId;
  }
);

// ======================================
// AUTHENTICATION SESSION STORAGE
// ======================================

ipcMain.handle(
  "edith:get-auth-session",
  async (event) => {
    verifyRenderer(event);

    await ensureSecureStorage();

    const encryptedData = await readEncryptedFile(
      AUTH_SESSION_FILE
    );

    if (!encryptedData) {
      return null;
    }

    try {
      const decryptedData =
        await safeStorage.decryptStringAsync(encryptedData);

      const session = JSON.parse(decryptedData);

      if (!validateAuthSession(session)) {
        await removeFile(AUTH_SESSION_FILE);
        return null;
      }

      return session;
    } catch {
      await removeFile(AUTH_SESSION_FILE);
      return null;
    }
  }
);

ipcMain.handle(
  "edith:set-auth-session",
  async (event, session) => {
    verifyRenderer(event);

    if (!validateAuthSession(session)) {
      throw new Error("Invalid authentication session.");
    }

    await writeEncryptedFile(
      AUTH_SESSION_FILE,
      JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        session_id: session.session_id
      })
    );

    return true;
  }
);

ipcMain.handle(
  "edith:clear-auth-session",
  async (event) => {
    verifyRenderer(event);

    await removeFile(AUTH_SESSION_FILE);

    return true;
  }
);

// ======================================
// WINDOW MANAGEMENT IPC HANDLERS
// ======================================

ipcMain.handle("edith:minimize-window", (event) => {
  verifyRenderer(event);
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.minimize();
  return true;
});

ipcMain.handle("edith:maximize-window", (event) => {
  verifyRenderer(event);
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
    return win.isMaximized();
  }
  return false;
});

ipcMain.handle("edith:close-window", (event) => {
  verifyRenderer(event);
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
  return true;
});

ipcMain.handle("edith:is-maximized", (event) => {
  verifyRenderer(event);
  const win = BrowserWindow.fromWebContents(event.sender);
  return win ? win.isMaximized() : false;
});

ipcMain.handle("edith:get-app-info", (event) => {
  verifyRenderer(event);
  return {
    appName: "E.D.I.T.H.",
    version: app.getVersion() || "0.1.0",
    platform: process.platform,
    isPackaged: app.isPackaged,
  };
});

// ======================================
// SYSTEM TRAY
// ======================================

let tray = null;

function createSystemTray(mainWindow) {
  if (tray) return;

  const iconSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="6" fill="#071b35" stroke="#48dfff" stroke-width="2"/>
      <circle cx="8" cy="8" r="2.5" fill="#48dfff"/>
    </svg>
  `;
  const icon = nativeImage.createFromBuffer(Buffer.from(iconSvg));

  try {
    tray = new Tray(icon);
    tray.setToolTip("E.D.I.T.H. — Personal AI Assistant");

    const contextMenu = Menu.buildFromTemplate([
      {
        label: "Open E.D.I.T.H",
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        },
      },
      {
        label: "Minimize to Tray",
        click: () => {
          if (mainWindow) {
            mainWindow.hide();
          }
        },
      },
      { type: "separator" },
      {
        label: "Quit E.D.I.T.H",
        click: () => {
          app.isQuitting = true;
          app.quit();
        },
      },
    ]);

    tray.setContextMenu(contextMenu);

    tray.on("double-click", () => {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    });
  } catch (error) {
    console.error("System tray creation failed:", error);
  }
}

// ======================================
// WINDOW CREATION
// ======================================

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 860,
    minHeight: 620,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: "#080B14",
    title: "E.D.I.T.H.",

    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  if (app.isPackaged) {
    mainWindow.loadFile(
      path.join(__dirname, "../dist/index.html")
    );
  } else {
    mainWindow.loadURL(DEV_SERVER_URL);
  }

  createSystemTray(mainWindow);
}

// ======================================
// APPLICATION LIFECYCLE
// ======================================

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
