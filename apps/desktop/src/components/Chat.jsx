
import { useEffect, useRef, useState } from "react";

import {
  sendChatMessage,
  getConversations,
  getConversation,
  deleteConversation,
  getMemorySuggestion,
  createMemory,
} from "../services/api";

import "./Chat.css";

function Chat() {
  const [messages, setMessages] = useState([
    {
      id: 1,
      role: "assistant",
      content: "Hello! I am E.D.I.T.H. How can I assist you today?",
    },
  ]);

  const [conversations, setConversations] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [input, setInput] = useState("");

  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");

  const [memorySuggestion, setMemorySuggestion] = useState(null);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [savingMemory, setSavingMemory] = useState(false);
  const [memoryNotice, setMemoryNotice] = useState("");

  // Prevent dismissed suggestions from reappearing in this app session.
  const [dismissedSuggestions, setDismissedSuggestions] = useState(
    new Set()
  );

  const messagesEndRef = useRef(null);
  const conversationIdRef = useRef(null);

  function updateConversationId(id) {
    conversationIdRef.current = id;
    setConversationId(id);
  }

  function suggestionKey(id, content) {
    return `${id}:${content.trim().toLowerCase()}`;
  }

  // Load authenticated conversation history.
  async function loadConversations() {
    setHistoryLoading(true);
    setHistoryError("");

    try {
      const data = await getConversations();
      setConversations(data);
    } catch (error) {
      setHistoryError(error.message);
    } finally {
      setHistoryLoading(false);
    }
  }

  // Request a memory suggestion without saving it.
  async function requestMemorySuggestion(id) {
    if (!id || conversationIdRef.current !== id) return;

    setSuggestionLoading(true);
    setMemorySuggestion(null);
    setMemoryNotice("");

    try {
      const result = await getMemorySuggestion(id);

      // Ignore results belonging to a conversation that is no longer open.
      if (conversationIdRef.current !== id) return;

      const suggestion = result?.suggestion;

      if (!suggestion?.content || !suggestion?.category) {
        setMemorySuggestion(null);
        return;
      }

      const key = suggestionKey(id, suggestion.content);

      if (dismissedSuggestions.has(key)) {
        setMemorySuggestion(null);
        return;
      }

      setMemorySuggestion({
        ...suggestion,
        conversationId: id,
      });
    } catch (error) {
      console.error("Memory suggestion failed:", error);
    } finally {
      if (conversationIdRef.current === id) {
        setSuggestionLoading(false);
      }
    }
  }

  // Restore the last active conversation.
  useEffect(() => {
    let mounted = true;

    async function initializeChat() {
      try {
        const data = await getConversations();

        if (!mounted) return;

        setConversations(data);

        const savedId = await window.edith.getActiveConversation();

        if (!savedId || !mounted) return;

        const conversation = await getConversation(savedId);

        if (!mounted) return;

        updateConversationId(conversation.id);

        setMessages(
          conversation.messages.map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content,
            status: "success",
          }))
        );
      } catch (error) {
        if (!mounted) return;

        console.error("Conversation restoration failed:", error);

        updateConversationId(null);

        setMessages([
          {
            id: Date.now(),
            role: "assistant",
            content:
              "Your previous conversation could not be restored. You can select it from history or start a new chat.",
          },
        ]);

        try {
          await window.edith.clearActiveConversation();
        } catch (storageError) {
          console.error(
            "Unable to clear saved conversation:",
            storageError
          );
        }

        if (mounted) {
          setHistoryError(error.message);
        }
      } finally {
        if (mounted) {
          setHistoryLoading(false);
        }
      }
    }

    initializeChat();

    return () => {
      mounted = false;
    };
  }, []);

  // Auto-scroll to the latest message.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, loading, memorySuggestion]);

  // Open an existing conversation.
  async function openConversation(id) {
    if (loading) return;

    try {
      const data = await getConversation(id);

      updateConversationId(data.id);

      setMessages(
        data.messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          status: "success",
        }))
      );

      setMemorySuggestion(null);
      setMemoryNotice("");

      await window.edith.setActiveConversation(data.id);
      setHistoryError("");
    } catch (error) {
      setHistoryError(error.message);
    }
  }

  // Start a new conversation.
  async function startNewChat() {
    if (loading) return;

    try {
      await window.edith.clearActiveConversation();

      updateConversationId(null);

      setMessages([
        {
          id: Date.now(),
          role: "assistant",
          content: "Hello! I am E.D.I.T.H. How can I assist you today?",
        },
      ]);

      setInput("");
      setMemorySuggestion(null);
      setMemoryNotice("");
      setSuggestionLoading(false);
      setHistoryError("");
    } catch (error) {
      setHistoryError("Unable to clear the saved conversation.");
      console.error(error);
    }
  }

  // Delete a conversation.
  async function handleDeleteConversation(id) {
    if (loading) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete this conversation?"
    );

    if (!confirmed) return;

    try {
      await deleteConversation(id);

      if (conversationIdRef.current === id) {
        await window.edith.clearActiveConversation();

        updateConversationId(null);

        setMessages([
          {
            id: Date.now(),
            role: "assistant",
            content: "Conversation deleted. How can I help you?",
          },
        ]);

        setMemorySuggestion(null);
        setMemoryNotice("");
      }

      await loadConversations();
    } catch (error) {
      setHistoryError(error.message);
    }
  }

  // Send a message to E.D.I.T.H.
  async function handleSend(event) {
    event?.preventDefault();

    const text = input.trim();

    if (!text || loading) return;

    const userMessage = {
      id: Date.now(),
      role: "user",
      content: text,
    };

    setMessages((previous) => [...previous, userMessage]);
    setInput("");
    setLoading(true);
    setMemorySuggestion(null);
    setMemoryNotice("");

    try {
      const response = await sendChatMessage(
        text,
        conversationIdRef.current
      );

      const activeId = response.conversation_id;

      updateConversationId(activeId);

      await window.edith.setActiveConversation(activeId);

      setMessages((previous) => [
        ...previous,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: response.message,
          status: response.status,
        },
      ]);

      await loadConversations();

      // Analyze in the background so chat does not wait for memory analysis.
      void requestMemorySuggestion(activeId);
    } catch (error) {
      setMessages((previous) => [
        ...previous,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: error.message || "Unable to connect to E.D.I.T.H.",
          status: "error",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  // Save only after explicit user approval.
  async function handleSaveMemory() {
    if (!memorySuggestion || savingMemory) return;

    const suggestion = memorySuggestion;

    setSavingMemory(true);
    setMemoryNotice("");

    try {
      await createMemory(
        suggestion.content,
        suggestion.category
      );

      setMemorySuggestion(null);
      setMemoryNotice("Memory saved successfully.");

      const key = suggestionKey(
        suggestion.conversationId,
        suggestion.content
      );

      setDismissedSuggestions((previous) => {
        const updated = new Set(previous);
        updated.add(key);
        return updated;
      });
    } catch (error) {
      setMemoryNotice(error.message || "Unable to save memory.");
    } finally {
      setSavingMemory(false);
    }
  }

  // Reject a suggestion without saving it.
  function handleRejectMemory() {
    if (!memorySuggestion) return;

    const key = suggestionKey(
      memorySuggestion.conversationId,
      memorySuggestion.content
    );

    setDismissedSuggestions((previous) => {
      const updated = new Set(previous);
      updated.add(key);
      return updated;
    });

    setMemorySuggestion(null);
    setMemoryNotice("Memory suggestion dismissed.");
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend(event);
    }
  }

  function formatDate(dateString) {
    if (!dateString) return "";

    return new Date(dateString).toLocaleDateString([], {
      day: "2-digit",
      month: "short",
    });
  }

  return (
    <section className="chat-page">
      <div className="chat-layout">

        <aside className="chat-sidebar">
          <div className="sidebar-header">
            <h3>HISTORY</h3>

            <button
              className="new-chat-button"
              onClick={startNewChat}
              disabled={loading}
            >
              + New Chat
            </button>
          </div>

          <div className="conversation-list">
            {historyLoading && (
              <p className="history-message">
                Loading conversations...
              </p>
            )}

            {!historyLoading && conversations.length === 0 && (
              <p className="history-message">
                No conversations yet.
              </p>
            )}

            {historyError && (
              <p className="history-error">
                {historyError}
              </p>
            )}

            {conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={`conversation-item ${
                  conversationId === conversation.id ? "active" : ""
                }`}
              >
                <button
                  className="conversation-select"
                  onClick={() => openConversation(conversation.id)}
                  disabled={loading}
                >
                  <span className="conversation-title">
                    {conversation.title}
                  </span>

                  <span className="conversation-date">
                    {formatDate(conversation.updated_at)}
                  </span>
                </button>

                <button
                  className="delete-conversation"
                  onClick={() =>
                    handleDeleteConversation(conversation.id)
                  }
                  disabled={loading}
                  title="Delete conversation"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </aside>

        <div className="chat-main">
          <header className="chat-header">
            <div>
              <h2>AI CONVERSATION</h2>
              <p>Your personal E.D.I.T.H assistant</p>
            </div>

            <button
              className="clear-chat"
              onClick={startNewChat}
              disabled={loading}
            >
              Clear Chat
            </button>
          </header>

          <div className="chat-messages">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`message-row ${message.role}`}
              >
                <div className="message-content">
                  <span className="message-author">
                    {message.role === "assistant" ? "E.D.I.T.H" : "YOU"}
                  </span>

                  <div className="message-bubble">
                    {message.content}
                  </div>

                  {message.status === "error" && (
                    <span className="message-notice error">
                      CONNECTION ERROR
                    </span>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="message-row assistant">
                <div className="message-content">
                  <span className="message-author">E.D.I.T.H</span>

                  <div className="message-bubble typing">
                    Thinking...
                  </div>
                </div>
              </div>
            )}

            {suggestionLoading && (
              <div className="memory-suggestion-loading">
                Checking for useful memory suggestions...
              </div>
            )}

            {memorySuggestion && (
              <div className="memory-suggestion-card">
                <div className="memory-suggestion-heading">
                  <strong>E.D.I.T.H. MEMORY SUGGESTION</strong>
                  <span>NEW</span>
                </div>

                <p>{memorySuggestion.content}</p>

                <small>
                  Category: {memorySuggestion.category}
                </small>

                <div className="memory-suggestion-actions">
                  <button
                    type="button"
                    onClick={handleSaveMemory}
                    disabled={savingMemory}
                  >
                    {savingMemory ? "SAVING..." : "SAVE TO MEMORY"}
                  </button>

                  <button
                    type="button"
                    onClick={handleRejectMemory}
                    disabled={savingMemory}
                  >
                    REJECT
                  </button>
                </div>
              </div>
            )}

            {memoryNotice && (
              <div className="memory-notice">
                {memoryNotice}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <form className="chat-input-area" onSubmit={handleSend}>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message E.D.I.T.H..."
              rows={1}
              disabled={loading}
            />

            <button
              type="submit"
              className="send-button"
              disabled={!input.trim() || loading}
            >
              {loading ? "SENDING..." : "SEND"}
            </button>
          </form>

          <p className="chat-disclaimer">
            E.D.I.T.H AI MODEL IS UNDER DEVELOPMENT
          </p>
        </div>
      </div>
    </section>
  );
}

export default Chat;
