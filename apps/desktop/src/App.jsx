import { useEffect, useState } from "react";

import Titlebar from "./components/Titlebar";
import Chat from "./components/Chat";
import Memory from "./components/Memory";
import Models from "./components/Models";
import Settings from "./components/Settings";
import SyncStatus from "./components/SyncStatus";

import { startAutoSync, stopAutoSync } from "./services/sync";

import {
  checkBackendHealth,
  loginUser,
  registerUser,
  getConversations,
  logoutUser,
  setCurrentSession,
  clearCurrentSession,
} from "./services/api";

const sections = [
  "Home",
  "Chat",
  "Memory",
  "Models",
  "Agents",
  "Tasks",
  "Research",
  "Settings",
];

function App() {
  const [activeSection, setActiveSection] = useState("Home");
  const [backendStatus, setBackendStatus] = useState("checking");

  const [authLoading, setAuthLoading] = useState(true);
  const [authSession, setAuthSession] = useState(null);
  const [authError, setAuthError] = useState("");
  const [authMode, setAuthMode] = useState("login");

  const [identifier, setIdentifier] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Theme management (dark by default)
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("edith_theme") || "dark";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("edith_theme", theme);
  }, [theme]);

  // =====================================
  // INITIALIZE BACKEND AND RESTORE SESSION
  // =====================================

  useEffect(() => {
    let mounted = true;

    async function initialize() {
      try {
        const online = await checkBackendHealth();

        if (!mounted) return;

        setBackendStatus(online ? "online" : "offline");

        if (!online) return;

        const savedSession = await window.edith?.getAuthSession?.();

        if (!savedSession || !mounted) return;

        setCurrentSession(savedSession);

        try {
          await getConversations();

          if (mounted) {
            setAuthSession(savedSession);
          }
        } catch (error) {
          console.error("Session restoration failed:", error);

          clearCurrentSession();
          await window.edith?.clearAuthSession?.();

          if (mounted) {
            setAuthError(
              "Your session has expired. Please sign in again."
            );
          }
        }
      } catch (error) {
        console.error("Initialization failed:", error);

        if (mounted) {
          setBackendStatus("offline");
        }
      } finally {
        if (mounted) {
          setAuthLoading(false);
        }
      }
    }

    initialize();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!authSession) return;
    startAutoSync(60000);
    return () => {
      stopAutoSync();
    };
  }, [authSession]);

  // =====================================
  // LOGIN AND REGISTRATION
  // =====================================

  async function handleAuthentication(event) {
    event.preventDefault();

    setAuthError("");
    setSubmitting(true);

    try {
      if (authMode === "register") {
        await registerUser(
          username.trim(),
          email.trim(),
          password
        );
      }

      const loginIdentifier =
        authMode === "register"
          ? username.trim()
          : identifier.trim();

      const result = await loginUser(
        loginIdentifier,
        password
      );

      const session = {
        access_token: result.access_token,
        refresh_token: result.refresh_token,
        session_id: result.session_id,
      };

      if (
        !session.access_token ||
        !session.refresh_token ||
        !session.session_id
      ) {
        throw new Error(
          "The server returned an incomplete session."
        );
      }

      await window.edith?.setAuthSession?.(session);

      setCurrentSession(session);

      await getConversations();

      setAuthSession(session);
      setActiveSection("Home");

      setPassword("");
      setIdentifier("");
      setUsername("");
      setEmail("");

    } catch (error) {
      clearCurrentSession();

      await window.edith?.clearAuthSession?.();

      setAuthError(
        error.message || "Authentication failed."
      );

    } finally {
      setSubmitting(false);
    }
  }

  // =====================================
  // LOGOUT
  // =====================================

  async function handleLogout() {
    try {
      await logoutUser();
    } catch (error) {
      console.error("Logout failed:", error);
    }

    clearCurrentSession();

    try {
      await window.edith?.clearAuthSession?.();
      await window.edith?.clearActiveConversation?.();
    } catch (error) {
      console.error(
        "Secure storage cleanup failed:",
        error
      );
    }

    setAuthSession(null);
    setActiveSection("Home");
    setAuthError("");
  }

  // =====================================
  // BACKEND STATUS
  // =====================================

  const statusText =
    backendStatus === "online"
      ? "BACKEND CONNECTED"
      : backendStatus === "offline"
        ? "BACKEND OFFLINE"
        : "CONNECTING...";

  // =====================================
  // INITIALIZATION SCREEN
  // =====================================

  if (authLoading) {
    return (
      <main className="app">
        <Titlebar title="E.D.I.T.H. — Initializing" />
        <section className="assistant">
          <p className="eyebrow">E.D.I.T.H SYSTEM</p>
          <h1>INITIALIZING...</h1>
          <p className="subtitle">Restoring your secure session.</p>
        </section>
      </main>
    );
  }

  // =====================================
  // BACKEND OFFLINE SCREEN
  // =====================================

  if (backendStatus === "offline") {
    return (
      <main className="app">
        <Titlebar title="E.D.I.T.H. — Backend Offline" />
        <section className="assistant">
          <p className="eyebrow">SYSTEM STATUS</p>
          <h1>BACKEND OFFLINE</h1>
          <p className="subtitle">
            Start the Python backend and restart E.D.I.T.H.
          </p>
        </section>
      </main>
    );
  }

  // =====================================
  // AUTHENTICATION SCREEN
  // =====================================

  if (!authSession) {
    return (
      <main className="app">
        <Titlebar title="E.D.I.T.H. — Secure Sign In" />

        <header className="topbar">
          <div className="brand">
            <span className="brand-dot" />
            <span>E.D.I.T.H</span>
          </div>

          <div className="system-status">
            <span className="status-dot" />
            BACKEND CONNECTED
          </div>
        </header>

        <section className="assistant auth-screen">
          <p className="eyebrow">SECURE ACCESS</p>

          <h1>
            WELCOME TO
            <br />
            <span>E.D.I.T.H.</span>
          </h1>

          <p className="subtitle">
            Enhanced Digital Intelligence & Task Handler
          </p>

          <form
            className="auth-card"
            onSubmit={handleAuthentication}
          >
            <h2>
              {authMode === "login"
                ? "SIGN IN"
                : "CREATE ACCOUNT"}
            </h2>

            {authMode === "register" ? (
              <>
                <input
                  type="text"
                  placeholder="Username"
                  value={username}
                  onChange={(event) =>
                    setUsername(event.target.value)
                  }
                  minLength={3}
                  maxLength={50}
                  required
                />

                <input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(event) =>
                    setEmail(event.target.value)
                  }
                  required
                />
              </>
            ) : (
              <input
                type="text"
                placeholder="Username or email"
                value={identifier}
                onChange={(event) =>
                  setIdentifier(event.target.value)
                }
                required
              />
            )}

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
              required
            />

            {authError && (
              <p className="auth-error">
                {authError}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
            >
              {submitting
                ? "PLEASE WAIT..."
                : authMode === "login"
                  ? "SIGN IN"
                  : "CREATE ACCOUNT"}
            </button>

            <p className="auth-switch">
              {authMode === "login"
                ? "Don't have an account?"
                : "Already have an account?"}

              <button
                type="button"
                onClick={() => {
                  setAuthMode(
                    authMode === "login"
                      ? "register"
                      : "login"
                  );

                  setAuthError("");
                }}
              >
                {authMode === "login"
                  ? "Register"
                  : "Sign in"}
              </button>
            </p>
          </form>
        </section>

        <footer>
          E.D.I.T.H © 2026 — PERSONAL INTELLIGENCE SYSTEM
        </footer>
      </main>
    );
  }

  // =====================================
  // AUTHENTICATED APPLICATION
  // =====================================

  return (
    <main className="app">
      {/* WINDOW TITLEBAR */}
      <Titlebar title={`E.D.I.T.H. — ${activeSection}`} />

      {/* TOP NAVIGATION */}
      <header className="topbar">
        <div
          className="brand"
          onClick={() => setActiveSection("Home")}
        >
          <span className="brand-dot" />
          <span>E.D.I.T.H</span>
        </div>

        <nav className="navigation">
          {sections.map((section) => (
            <button
              key={section}
              className={
                activeSection === section
                  ? "nav-link active"
                  : "nav-link"
              }
              onClick={() => setActiveSection(section)}
            >
              {section}
            </button>
          ))}
        </nav>

        <SyncStatus />

        <div className="system-status">
          <span
            className="status-dot"
            style={{ background: "#48dfff" }}
          />
          {statusText}
        </div>

        <button
          className="logout-button"
          onClick={handleLogout}
        >
          LOGOUT
        </button>
      </header>

      {/* HOME MODULE */}
      {activeSection === "Home" ? (
        <section className="assistant">
          <p className="eyebrow">
            PERSONAL AI SYSTEM
          </p>

          <h1>
            GOOD DAY.
            <br />
            <span>I AM E.D.I.T.H.</span>
          </h1>

          <p className="subtitle">
            Enhanced Digital Intelligence & Task Handler
          </p>

          <div className="orb-container">
            <div className="orb-ring ring-one" />
            <div className="orb-ring ring-two" />

            <div className="orb">
              <div className="orb-core" />
            </div>
          </div>

          <p className="listening-status">
            SYSTEM ONLINE
          </p>

          <p className="instruction">
            Your personal assistant is ready.
          </p>

          <div className="platform-info">
            PLATFORM: {window.edith?.platform || "WINDOWS x64"}
          </div>
        </section>

      ) : activeSection === "Chat" ? (
        /* CHAT MODULE */
        <Chat />

      ) : activeSection === "Memory" ? (
        /* MEMORY MODULE */
        <Memory />

      ) : activeSection === "Models" ? (
        /* AI MODELS & LOCAL OLLAMA MODULE */
        <Models />

      ) : activeSection === "Settings" ? (
        /* APPLICATION SETTINGS MODULE */
        <Settings currentTheme={theme} onThemeChange={setTheme} />

      ) : (
        /* FUTURE MODULES PLACEHOLDER */
        <section className="section-page">
          <p className="eyebrow">
            E.D.I.T.H SYSTEM
          </p>

          <h1 className="section-title">
            {activeSection}
          </h1>

          <p className="subtitle">
            {activeSection} module
          </p>

          <div className="module-card">
            <div className="module-icon">
              ✦
            </div>

            <h2>
              {activeSection} is ready for development
            </h2>

            <p>
              This module is part of the E.D.I.T.H architecture.
              Its functionality will be implemented in a later
              development stage.
            </p>

            <span className="module-status">
              MODULE INITIALIZED
            </span>
          </div>
        </section>
      )}

      {/* FOOTER */}
      <footer>
        E.D.I.T.H © 2026 — PERSONAL INTELLIGENCE SYSTEM
      </footer>
    </main>
  );
}

export default App;
