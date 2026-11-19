
import { useEffect, useMemo, useState } from "react";

import {
  getMemories,
  createMemory,
  updateMemory,
  deleteMemory,
  checkDuplicateMemory,
} from "../services/api";

import "./Memory.css";

const categories = [
  "preference",
  "personal_context",
  "project",
  "other",
];

function Memory() {
  const [memories, setMemories] = useState([]);
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("other");

  const [filter, setFilter] = useState("all");
  const [editingId, setEditingId] = useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Duplicate review state.
  const [duplicateMatches, setDuplicateMatches] = useState([]);
  const [pendingMemory, setPendingMemory] = useState(null);

  async function loadMemories() {
    setLoading(true);
    setError("");

    try {
      const data = await getMemories();
      setMemories(data);
    } catch (err) {
      setError(err.message || "Unable to load memories.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMemories();
  }, []);

  const filteredMemories = useMemo(() => {
    if (filter === "all") return memories;

    return memories.filter(
      (memory) => memory.category === filter
    );
  }, [memories, filter]);

  function resetForm() {
    setContent("");
    setCategory("other");
    setEditingId(null);
    setDuplicateMatches([]);
    setPendingMemory(null);
  }

  function cancelDuplicateReview() {
    setDuplicateMatches([]);
    setPendingMemory(null);
    setSuccess("Memory operation cancelled.");
  }

  // Create or update a memory after duplicate review.
  async function saveMemoryAsNew() {
    if (!pendingMemory) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await createMemory(
        pendingMemory.content,
        pendingMemory.category
      );

      resetForm();
      setSuccess("New memory saved successfully.");
      await loadMemories();
    } catch (err) {
      setError(err.message || "Unable to save memory.");
    } finally {
      setSaving(false);
    }
  }

  async function updateExistingMemory(memoryId) {
    if (!pendingMemory) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await updateMemory(
        memoryId,
        pendingMemory.content,
        pendingMemory.category
      );

      resetForm();
      setSuccess("Existing memory updated successfully.");
      await loadMemories();
    } catch (err) {
      setError(err.message || "Unable to update memory.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const trimmedContent = content.trim();

    if (!trimmedContent) {
      setError("Memory content cannot be empty.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      // Editing an existing memory is an explicit user action.
      // Update it directly instead of matching it against itself.
      if (editingId !== null) {
        await updateMemory(
          editingId,
          trimmedContent,
          category
        );

        resetForm();
        setSuccess("Memory updated successfully.");
        await loadMemories();
        return;
      }

      // Check for possible duplicates before creating a new memory.
      const result = await checkDuplicateMemory(
        trimmedContent
      );

      if (result.is_duplicate && result.matches.length > 0) {
        setPendingMemory({
          content: trimmedContent,
          category,
        });

        setDuplicateMatches(result.matches);
        return;
      }

      await createMemory(trimmedContent, category);

      resetForm();
      setSuccess("Memory saved successfully.");
      await loadMemories();
    } catch (err) {
      setError(err.message || "Unable to save memory.");
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(memory) {
    setEditingId(memory.id);
    setContent(memory.content);
    setCategory(memory.category);
    setDuplicateMatches([]);
    setPendingMemory(null);
    setError("");
    setSuccess("");
  }

  async function handleDelete(memoryId) {
    const confirmed = window.confirm(
      "Are you sure you want to permanently delete this memory?"
    );

    if (!confirmed) return;

    setError("");
    setSuccess("");

    try {
      await deleteMemory(memoryId);

      if (editingId === memoryId) {
        resetForm();
      }

      setSuccess("Memory deleted successfully.");
      await loadMemories();
    } catch (err) {
      setError(err.message || "Unable to delete memory.");
    }
  }

  function formatDate(dateString) {
    if (!dateString) return "";

    return new Date(dateString).toLocaleString();
  }

  return (
    <section className="memory-page">

      <div className="memory-heading">
        <div>
          <p className="eyebrow">PERSONAL KNOWLEDGE SYSTEM</p>
          <h1 className="section-title">MEMORY</h1>
          <p className="memory-subtitle">
            Manage information E.D.I.T.H. can remember across conversations.
          </p>
        </div>

        <div className="memory-count">
          <span>{memories.length}</span>
          <small>SAVED MEMORIES</small>
        </div>
      </div>

      <div className="memory-layout">

        <form className="memory-form" onSubmit={handleSubmit}>
          <h2>
            {editingId !== null ? "EDIT MEMORY" : "ADD MEMORY"}
          </h2>

          <label htmlFor="memory-content">
            MEMORY CONTENT
          </label>

          <textarea
            id="memory-content"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Write something you want E.D.I.T.H. to remember..."
            rows={6}
            maxLength={10000}
            required
            disabled={saving || Boolean(pendingMemory)}
          />

          <label htmlFor="memory-category">
            CATEGORY
          </label>

          <select
            id="memory-category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            disabled={saving || Boolean(pendingMemory)}
          >
            {categories.map((item) => (
              <option key={item} value={item}>
                {item.replace("_", " ").toUpperCase()}
              </option>
            ))}
          </select>

          {error && (
            <p className="memory-error">{error}</p>
          )}

          {success && (
            <p className="memory-success">{success}</p>
          )}

          <div className="memory-form-actions">
            <button
              type="submit"
              disabled={
                saving ||
                !content.trim() ||
                Boolean(pendingMemory)
              }
              className="memory-save-button"
            >
              {saving
                ? "CHECKING..."
                : editingId !== null
                  ? "UPDATE MEMORY"
                  : "CHECK & SAVE MEMORY"}
            </button>

            {editingId !== null && (
              <button
                type="button"
                className="memory-cancel-button"
                onClick={resetForm}
                disabled={saving}
              >
                CANCEL
              </button>
            )}
          </div>

          {duplicateMatches.length > 0 && pendingMemory && (
            <div className="memory-duplicate-review">
              <h3>POSSIBLE DUPLICATE FOUND</h3>

              <p className="memory-duplicate-description">
                This memory resembles information already saved.
                Choose how you want to proceed.
              </p>

              <div className="memory-pending-content">
                <small>NEW MEMORY</small>
                <p>{pendingMemory.content}</p>
                <small>
                  Category: {pendingMemory.category.replace("_", " ")}
                </small>
              </div>

              {duplicateMatches.map((match) => (
                <article
                  className="memory-duplicate-match"
                  key={match.id}
                >
                  <div className="memory-duplicate-top">
                    <strong>EXISTING MEMORY #{match.id}</strong>
                    <span>
                      {Math.round(match.similarity * 100)}% text similarity
                    </span>
                  </div>

                  <p>{match.content}</p>

                  <small>
                    Category: {match.category.replace("_", " ")}
                  </small>

                  <button
                    type="button"
                    className="memory-update-existing-button"
                    onClick={() => updateExistingMemory(match.id)}
                    disabled={saving}
                  >
                    {saving
                      ? "PROCESSING..."
                      : "UPDATE THIS MEMORY"}
                  </button>
                </article>
              ))}

              <div className="memory-duplicate-actions">
                <button
                  type="button"
                  onClick={saveMemoryAsNew}
                  disabled={saving}
                >
                  SAVE AS NEW
                </button>

                <button
                  type="button"
                  onClick={cancelDuplicateReview}
                  disabled={saving}
                >
                  REJECT
                </button>
              </div>
            </div>
          )}
        </form>

        <div className="memory-list-panel">

          <div className="memory-list-heading">
            <h2>SAVED MEMORIES</h2>

            <button
              className="memory-refresh-button"
              onClick={loadMemories}
              disabled={loading}
            >
              REFRESH
            </button>
          </div>

          <div className="memory-filters">
            <button
              className={filter === "all" ? "selected" : ""}
              onClick={() => setFilter("all")}
            >
              ALL
            </button>

            {categories.map((item) => (
              <button
                key={item}
                className={filter === item ? "selected" : ""}
                onClick={() => setFilter(item)}
              >
                {item.replace("_", " ").toUpperCase()}
              </button>
            ))}
          </div>

          {loading ? (
            <p className="memory-empty">
              Loading memories...
            </p>
          ) : filteredMemories.length === 0 ? (
            <div className="memory-empty">
              <span className="memory-empty-icon">✦</span>
              <h3>No memories found</h3>
              <p>
                Add a memory to begin building E.D.I.T.H.'s knowledge.
              </p>
            </div>
          ) : (
            <div className="memory-list">
              {filteredMemories.map((memory) => (
                <article
                  className="memory-card"
                  key={memory.id}
                >
                  <div className="memory-card-top">
                    <span className="memory-category">
                      {memory.category.replace("_", " ")}
                    </span>

                    <span className="memory-id">
                      MEMORY #{memory.id}
                    </span>
                  </div>

                  <p className="memory-card-content">
                    {memory.content}
                  </p>

                  <div className="memory-card-bottom">
                    <span className="memory-date">
                      UPDATED: {formatDate(memory.updated_at)}
                    </span>

                    <div className="memory-card-actions">
                      <button
                        onClick={() => handleEdit(memory)}
                      >
                        EDIT
                      </button>

                      <button
                        className="memory-delete-button"
                        onClick={() => handleDelete(memory.id)}
                      >
                        DELETE
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

        </div>
      </div>
    </section>
  );
}

export default Memory;
