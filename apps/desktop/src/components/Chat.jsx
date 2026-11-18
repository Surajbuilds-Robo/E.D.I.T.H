
import { useEffect, useRef, useState } from "react";

import {
  sendChatMessage,
  getConversations,
  getConversation,
  deleteConversation
} from "../services/api";

import "./Chat.css";

function Chat() {
  const [messages, setMessages] = useState([
    {
      id: 1,
      role: "assistant",
      content: "Hello! I am E.D.I.T.H. How can I assist you today?"
    }
  ]);

  const [conversations, setConversations] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [input, setInput] = useState("");

  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");

  const messagesEndRef = useRef(null);

  // Load history and restore the last active conversation.
  useEffect(() => {
    async function initializeChat() {
      await loadConversations();

      try {
        const savedId = await window.edith.getActiveConversation();

        if (savedId) {
          const conversation = await getConversation(savedId);

          setConversationId(conversation.id);

          setMessages(
            conversation.messages.map((message) => ({
              id: message.id,
              role: message.role,
              content: message.content,
              status: "success"
            }))
          );
        }
      } catch (error) {
        console.error("Conversation restoration failed:", error);

        setConversationId(null);

        setMessages([
          {
            id: Date.now(),
            role: "assistant",
            content: "Your previous conversation could not be restored. You can select it from history or start a new chat."
          }
        ]);

        try {
          await window.edith.clearActiveConversation();
        } catch (storageError) {
          console.error("Unable to clear saved conversation:", storageError);
        }
      }
    }

    initializeChat();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth"
    });
  }, [messages, loading]);

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

  async function openConversation(id) {
    if (loading) return;

    try {
      const data = await getConversation(id);

      setConversationId(data.id);

      setMessages(
        data.messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          status: "success"
        }))
      );

      await window.edith.setActiveConversation(data.id);

      setHistoryError("");
    } catch (error) {
      setHistoryError(error.message);
    }
  }

  async function startNewChat() {
    if (loading) return;

    try {
      await window.edith.clearActiveConversation();

      setConversationId(null);

      setMessages([
        {
          id: Date.now(),
          role: "assistant",
          content: "Hello! I am E.D.I.T.H. How can I assist you today?"
        }
      ]);

      setInput("");
      setHistoryError("");
    } catch (error) {
      setHistoryError("Unable to clear the saved conversation.");
      console.error(error);
    }
  }

  async function handleDeleteConversation(id) {
    if (loading) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete this conversation?"
    );

    if (!confirmed) return;

    try {
      await deleteConversation(id);

      if (conversationId === id) {
        await window.edith.clearActiveConversation();

        setConversationId(null);

        setMessages([
          {
            id: Date.now(),
            role: "assistant",
            content: "Conversation deleted. How can I help you?"
          }
        ]);
      }

      await loadConversations();
    } catch (error) {
      setHistoryError(error.message);
    }
  }

  async function handleSend() {
    const text = input.trim();

    if (!text || loading) return;

    const userMessage = {
      id: Date.now(),
      role: "user",
      content: text
    };

    setMessages((previous) => [...previous, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const response = await sendChatMessage(
        text,
        conversationId
      );

      setConversationId(response.conversation_id);

      // Persist the active conversation securely.
      await window.edith.setActiveConversation(
        response.conversation_id
      );

      setMessages((previous) => [
        ...previous,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: response.message,
          status: response.status
        }
      ]);

      await loadConversations();

    } catch (error) {
      setMessages((previous) => [
        ...previous,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: error.message || "Unable to connect to E.D.I.T.H.",
          status: "error"
        }
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }

  function formatDate(dateString) {
    if (!dateString) return "";

    return new Date(dateString).toLocaleDateString([], {
      day: "2-digit",
      month: "short"
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
                  onClick={() => handleDeleteConversation(conversation.id)}
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

            <div ref={messagesEndRef} />

          </div>

          <div className="chat-input-area">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message E.D.I.T.H..."
              rows={1}
              disabled={loading}
            />

            <button
              className="send-button"
              onClick={handleSend}
              disabled={!input.trim() || loading}
            >
              SEND
            </button>
          </div>

          <p className="chat-disclaimer">
            E.D.I.T.H AI MODEL IS UNDER DEVELOPMENT
          </p>

        </div>

      </div>

    </section>
  );
}

export default Chat;
