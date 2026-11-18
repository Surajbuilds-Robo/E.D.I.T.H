
import { useEffect, useState } from "react";
import Chat from "./components/Chat";
import { checkBackendHealth } from "./services/api";

const sections = [
  "Home",
  "Chat",
  "Agents",
  "Memory",
  "Tasks",
  "Research",
  "Settings"
];

function App() {
  const [activeSection, setActiveSection] = useState("Home");
  const [backendStatus, setBackendStatus] = useState("checking");

  // Check Python backend connection
  useEffect(() => {
    let isMounted = true;

    async function checkConnection() {
      const result = await checkBackendHealth();

      if (isMounted) {
        setBackendStatus(result.status);
      }
    }

    checkConnection();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main className="app">

      {/* TOP NAVIGATION BAR */}
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

        {/* BACKEND CONNECTION STATUS */}
        <div className="system-status">

          <span
            className="status-dot"
            style={{
              background:
                backendStatus === "online"
                  ? "#48dfff"
                  : backendStatus === "offline"
                    ? "#ff5252"
                    : "#eab308"
            }}
          />

          {backendStatus === "online"
            ? "BACKEND CONNECTED"
            : backendStatus === "offline"
              ? "BACKEND OFFLINE"
              : "CONNECTING..."}

        </div>

      </header>

      {/* MAIN CONTENT */}
      {activeSection === "Home" ? (

        /* HOME SCREEN */
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

          {/* ANIMATED AI ORB */}
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
            Your personal assistant is initializing.
          </p>

          <div className="platform-info">
            PLATFORM: {window.edith?.platform || "UNKNOWN"}
          </div>

        </section>

      ) : activeSection === "Chat" ? (

        /* CHAT SCREEN */
        <Chat />

      ) : (

        /* OTHER MODULE SCREENS */
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
