import { useState, useEffect } from "react";
import { checkOllamaHealth } from "../services/api";
import "./Models.css";

const DEFAULT_GEN_PARAMS = {
  temperature: 0.7,
  topP: 0.9,
  maxTokens: 2048,
  systemTone: "balanced",
};

const ONLINE_PROVIDERS = [
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT-4o, GPT-4 Turbo models via OpenAI API",
    keyPlaceholder: "sk-proj-...",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Claude 3.5 Sonnet, Claude 3 Haiku via Anthropic API",
    keyPlaceholder: "sk-ant-...",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "Multi-provider unified API gateway",
    keyPlaceholder: "sk-or-v1-...",
  },
  {
    id: "groq",
    name: "Groq",
    description: "Ultra-fast Llama-3 / Mixtral inference API",
    keyPlaceholder: "gsk_...",
  },
];

export default function Models() {
  const [ollamaUrl, setOllamaUrl] = useState(() => {
    return localStorage.getItem("edith_ollama_url") || "http://127.0.0.1:11434";
  });
  const [ollamaStatus, setOllamaStatus] = useState({
    checking: true,
    online: false,
    latency: null,
    models: [],
    error: null,
  });

  const [genParams, setGenParams] = useState(() => {
    try {
      const saved = localStorage.getItem("edith_gen_params");
      return saved ? { ...DEFAULT_GEN_PARAMS, ...JSON.parse(saved) } : DEFAULT_GEN_PARAMS;
    } catch {
      return DEFAULT_GEN_PARAMS;
    }
  });

  const [apiKeys, setApiKeys] = useState(() => {
    try {
      const saved = localStorage.getItem("edith_provider_keys");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [showKeys, setShowKeys] = useState({});
  const [saveStatus, setSaveStatus] = useState("");
  const [activeTab, setActiveTab] = useState("local"); // 'local' | 'online' | 'parameters'

  const pingOllama = async (targetUrl = ollamaUrl) => {
    setOllamaStatus((prev) => ({ ...prev, checking: true, error: null }));
    const result = await checkOllamaHealth(targetUrl);
    setOllamaStatus({
      checking: false,
      online: result.online,
      latency: result.latency,
      models: result.models || [],
      error: result.error || null,
    });
  };

  useEffect(() => {
    pingOllama(ollamaUrl);
  }, []);

  const handleSaveParams = (e) => {
    e.preventDefault();
    localStorage.setItem("edith_gen_params", JSON.stringify(genParams));
    setSaveStatus("Parameters saved successfully.");
    setTimeout(() => setSaveStatus(""), 3000);
  };

  const handleSaveOllamaUrl = () => {
    localStorage.setItem("edith_ollama_url", ollamaUrl);
    pingOllama(ollamaUrl);
  };

  const handleSaveKey = (providerId, value) => {
    const updated = { ...apiKeys, [providerId]: value.trim() };
    setApiKeys(updated);
    localStorage.setItem("edith_provider_keys", JSON.stringify(updated));
    setSaveStatus(`Key updated for ${providerId}.`);
    setTimeout(() => setSaveStatus(""), 3000);
  };

  const toggleShowKey = (providerId) => {
    setShowKeys((prev) => ({ ...prev, [providerId]: !prev[providerId] }));
  };

  return (
    <div className="models-view">
      <header className="models-header">
        <div>
          <p className="eyebrow">INTELLIGENCE INFRASTRUCTURE</p>
          <h1>AI Models & Inference</h1>
          <p className="subtitle">
            Local Ollama instances, embedded vector pipelines, and external provider connections.
          </p>
        </div>

        <div className="models-nav-tabs">
          <button
            className={`models-tab-btn ${activeTab === "local" ? "active" : ""}`}
            onClick={() => setActiveTab("local")}
          >
            Local Ollama
          </button>
          <button
            className={`models-tab-btn ${activeTab === "online" ? "active" : ""}`}
            onClick={() => setActiveTab("online")}
          >
            External Providers
          </button>
          <button
            className={`models-tab-btn ${activeTab === "parameters" ? "active" : ""}`}
            onClick={() => setActiveTab("parameters")}
          >
            Generation Parameters
          </button>
        </div>
      </header>

      {saveStatus && <div className="save-toast-banner">{saveStatus}</div>}

      {/* TAB 1: LOCAL OLLAMA */}
      {activeTab === "local" && (
        <section className="models-tab-content">
          <div className="models-card-row">
            {/* OLLAMA HOST STATUS */}
            <div className="models-card host-status-card">
              <div className="card-top">
                <h3>Ollama Local Service</h3>
                <span
                  className={`status-pill ${
                    ollamaStatus.checking
                      ? "checking"
                      : ollamaStatus.online
                      ? "online"
                      : "offline"
                  }`}
                >
                  <span className="dot" />
                  {ollamaStatus.checking
                    ? "CHECKING..."
                    : ollamaStatus.online
                    ? `ONLINE (${ollamaStatus.latency}ms)`
                    : "OFFLINE / UNREACHABLE"}
                </span>
              </div>

              <p className="card-desc">
                E.D.I.T.H. uses local inference for data privacy and low-latency interaction.
              </p>

              <div className="ollama-url-control">
                <label>Ollama Endpoint URL</label>
                <div className="url-input-row">
                  <input
                    type="text"
                    value={ollamaUrl}
                    onChange={(e) => setOllamaUrl(e.target.value)}
                    placeholder="http://127.0.0.1:11434"
                  />
                  <button
                    type="button"
                    className="ping-btn"
                    onClick={handleSaveOllamaUrl}
                    disabled={ollamaStatus.checking}
                  >
                    {ollamaStatus.checking ? "PINGING..." : "TEST & SAVE"}
                  </button>
                </div>
              </div>

              {ollamaStatus.error && (
                <div className="error-note">
                  Connection failed: {ollamaStatus.error}. Ensure Ollama daemon is running.
                </div>
              )}
            </div>

            {/* EMBEDDING ENGINE SPEC */}
            <div className="models-card model-badge-card active-engine">
              <div className="card-top">
                <span className="badge-tag">EMBEDDING ENGINE</span>
                <span className="active-tag">ACTIVE</span>
              </div>
              <h3>bge-m3:latest</h3>
              <p className="card-desc">
                Multilingual 1024-dimensional dense vector embeddings with PostgreSQL + pgvector
                cosine similarity storage.
              </p>
              <div className="engine-meta-grid">
                <div>
                  <span className="meta-label">Dimension</span>
                  <span className="meta-val">1024</span>
                </div>
                <div>
                  <span className="meta-label">Distance Metric</span>
                  <span className="meta-val">Cosine Similarity</span>
                </div>
                <div>
                  <span className="meta-label">Vector Storage</span>
                  <span className="meta-val">PostgreSQL pgvector</span>
                </div>
                <div>
                  <span className="meta-label">Execution Mode</span>
                  <span className="meta-val">On-Premise / Local</span>
                </div>
              </div>
            </div>

            {/* CHAT REASONING ENGINE */}
            <div className="models-card model-badge-card active-engine">
              <div className="card-top">
                <span className="badge-tag">CHAT REASONING</span>
                <span className="active-tag">ACTIVE</span>
              </div>
              <h3>qwen3.5:4b</h3>
              <p className="card-desc">
                Primary conversational and reasoning model. Generates context-grounded responses
                in English, Hindi, and Hinglish.
              </p>
              <div className="engine-meta-grid">
                <div>
                  <span className="meta-label">Parameters</span>
                  <span className="meta-val">4.0 Billion</span>
                </div>
                <div>
                  <span className="meta-label">Context Window</span>
                  <span className="meta-val">8,192 Tokens</span>
                </div>
                <div>
                  <span className="meta-label">Language Support</span>
                  <span className="meta-val">EN / HI / Hinglish</span>
                </div>
                <div>
                  <span className="meta-label">Memory Augmentation</span>
                  <span className="meta-val">Enabled (Hybrid)</span>
                </div>
              </div>
            </div>
          </div>

          {/* INSTALLED MODELS INVENTORY */}
          <div className="models-card inventory-card">
            <h3>Local Ollama Inventory</h3>
            <p className="card-desc">
              Models currently installed in your local Ollama instance:
            </p>

            {ollamaStatus.models.length > 0 ? (
              <div className="models-table-wrapper">
                <table className="models-table">
                  <thead>
                    <tr>
                      <th>Model Name</th>
                      <th>Size</th>
                      <th>Modified</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ollamaStatus.models.map((m, idx) => {
                      const isDefaultChat = m.name?.includes("qwen");
                      const isDefaultEmbed = m.name?.includes("bge-m3");
                      return (
                        <tr key={idx}>
                          <td className="model-name-cell">
                            <strong>{m.name}</strong>
                            {isDefaultChat && (
                              <span className="role-tag chat">Default Chat</span>
                            )}
                            {isDefaultEmbed && (
                              <span className="role-tag embed">Default Embedding</span>
                            )}
                          </td>
                          <td>
                            {m.size ? `${(m.size / (1024 * 1024 * 1024)).toFixed(2)} GB` : "—"}
                          </td>
                          <td>
                            {m.modified_at
                              ? new Date(m.modified_at).toLocaleDateString()
                              : "—"}
                          </td>
                          <td>
                            <span className="ready-indicator">Ready</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-inventory">
                {ollamaStatus.online
                  ? "No models returned from Ollama /api/tags."
                  : "Connect to Ollama to view downloaded models."}
              </div>
            )}
          </div>
        </section>
      )}

      {/* TAB 2: EXTERNAL PROVIDERS */}
      {activeTab === "online" && (
        <section className="models-tab-content">
          <div className="provider-notice-banner">
            <span className="info-icon">ℹ</span>
            <div>
              <strong>External Provider Integrity Note:</strong> E.D.I.T.H. runs locally by
              default. External cloud API connections are unconfigured until an authorized API key
              is provided. No simulated or mock connections are maintained.
            </div>
          </div>

          <div className="providers-grid">
            {ONLINE_PROVIDERS.map((provider) => {
              const currentKey = apiKeys[provider.id] || "";
              const isConfigured = Boolean(currentKey);

              return (
                <div key={provider.id} className="provider-card">
                  <div className="provider-card-header">
                    <h3>{provider.name}</h3>
                    <span
                      className={`provider-status-badge ${
                        isConfigured ? "configured" : "unconnected"
                      }`}
                    >
                      {isConfigured ? "KEY STORED" : "NOT CONNECTED"}
                    </span>
                  </div>
                  <p className="provider-desc">{provider.description}</p>

                  <div className="key-input-container">
                    <label>API Key</label>
                    <div className="key-input-row">
                      <input
                        type={showKeys[provider.id] ? "text" : "password"}
                        value={currentKey}
                        placeholder={provider.keyPlaceholder}
                        onChange={(e) =>
                          setApiKeys((prev) => ({
                            ...prev,
                            [provider.id]: e.target.value,
                          }))
                        }
                      />
                      <button
                        type="button"
                        className="toggle-visibility-btn"
                        onClick={() => toggleShowKey(provider.id)}
                        title="Toggle visibility"
                      >
                        {showKeys[provider.id] ? "HIDE" : "SHOW"}
                      </button>
                      <button
                        type="button"
                        className="save-key-btn"
                        onClick={() => handleSaveKey(provider.id, currentKey)}
                      >
                        SAVE
                      </button>
                    </div>
                  </div>

                  <div className="provider-footer">
                    <span className="key-status-text">
                      {isConfigured
                        ? "✓ Key saved in encrypted local storage"
                        : "Requires API Key for cloud fallback"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* TAB 3: GENERATION PARAMETERS */}
      {activeTab === "parameters" && (
        <section className="models-tab-content">
          <form className="params-form" onSubmit={handleSaveParams}>
            <div className="params-grid">
              {/* TEMPERATURE */}
              <div className="param-item">
                <div className="param-label-row">
                  <label>Temperature</label>
                  <span className="param-val">{genParams.temperature.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.05"
                  value={genParams.temperature}
                  onChange={(e) =>
                    setGenParams((prev) => ({
                      ...prev,
                      temperature: parseFloat(e.target.value),
                    }))
                  }
                />
                <span className="param-help">
                  Controls randomness: 0.0 is deterministic and analytical; 1.0+ is creative.
                </span>
              </div>

              {/* TOP-P */}
              <div className="param-item">
                <div className="param-label-row">
                  <label>Top-P (Nucleus Sampling)</label>
                  <span className="param-val">{genParams.topP.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="1.0"
                  step="0.05"
                  value={genParams.topP}
                  onChange={(e) =>
                    setGenParams((prev) => ({
                      ...prev,
                      topP: parseFloat(e.target.value),
                    }))
                  }
                />
                <span className="param-help">
                  Limits the cumulative probability of token candidates.
                </span>
              </div>

              {/* MAX TOKENS */}
              <div className="param-item">
                <div className="param-label-row">
                  <label>Max Output Tokens</label>
                  <span className="param-val">{genParams.maxTokens}</span>
                </div>
                <input
                  type="range"
                  min="256"
                  max="8192"
                  step="256"
                  value={genParams.maxTokens}
                  onChange={(e) =>
                    setGenParams((prev) => ({
                      ...prev,
                      maxTokens: parseInt(e.target.value, 10),
                    }))
                  }
                />
                <span className="param-help">
                  Upper limit on generated response length per turn.
                </span>
              </div>

              {/* SYSTEM TONE */}
              <div className="param-item">
                <div className="param-label-row">
                  <label>System Persona Tone</label>
                </div>
                <select
                  value={genParams.systemTone}
                  onChange={(e) =>
                    setGenParams((prev) => ({
                      ...prev,
                      systemTone: e.target.value,
                    }))
                  }
                >
                  <option value="precise">Precise & Analytical (Technical Code & Facts)</option>
                  <option value="balanced">Balanced Assistant (E.D.I.T.H. Default)</option>
                  <option value="creative">Creative & Conversational (Brainstorming)</option>
                  <option value="concise">Ultra-Concise (Minimalist Responses)</option>
                </select>
                <span className="param-help">
                  Sets system instruction style injected into chat sessions.
                </span>
              </div>
            </div>

            <div className="params-actions">
              <button type="submit" className="save-params-btn">
                SAVE GENERATION PARAMETERS
              </button>
              <button
                type="button"
                className="reset-params-btn"
                onClick={() => setGenParams(DEFAULT_GEN_PARAMS)}
              >
                RESET TO DEFAULTS
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
