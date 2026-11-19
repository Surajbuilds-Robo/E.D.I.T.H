
const {
  app,
  BrowserWindow,
  ipcMain,
  safeStorage
} = require("electron");

const path = require("path");
const fs = require("fs/promises");

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
// WINDOW CREATION
// ======================================

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
