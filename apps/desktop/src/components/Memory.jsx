
import { useEffect, useMemo, useState } from "react";

import {
  getMemories,
  createMemory,
  updateMemory,
  deleteMemory,
  checkDuplicateMemory,
  getConsolidationProposals,
  applyConsolidationProposal,
  restoreConsolidatedMemory,
  getMemoryCleanupReview,
  searchMemories,
  exportMemoriesJson,
  exportMemoriesCsv,
  previewMemoryImport,
  confirmMemoryImport,
  unarchiveMemory,
} from "../services/api";

import "./Memory.css";

const categories = [
  "preference",
  "personal_context",
  "project",
  "other",
];

const importanceLevels = [
  "critical",
  "high",
  "normal",
  "low",
];

function Memory() {
  const [memories, setMemories] = useState([]);
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("other");

  const [filter, setFilter] = useState("all");
  const [importanceFilter, setImportanceFilter] = useState("all");

  const [editingId, setEditingId] = useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Duplicate review state.
  const [duplicateMatches, setDuplicateMatches] = useState([]);
  const [pendingMemory, setPendingMemory] = useState(null);

  // Consolidation review state.
  const [consolidationProposals, setConsolidationProposals] = useState([]);
  const [activeProposalIndex, setActiveProposalIndex] = useState(0);
  const [consolidating, setConsolidating] = useState(false);
  const [applyingProposal, setApplyingProposal] = useState(false);
  const [editedConsolidatedContent, setEditedConsolidatedContent] = useState("");
  const [editedConsolidatedCategory, setEditedConsolidatedCategory] = useState("other");
  const [consolidationNotice, setConsolidationNotice] = useState("");
  const [consolidationError, setConsolidationError] = useState("");

  // Memory cleanup review state.
  const [cleanupReview, setCleanupReview] = useState(null);
  const [reviewingCleanup, setReviewingCleanup] = useState(false);
  const [cleanupNotice, setCleanupNotice] = useState("");
  const [cleanupError, setCleanupError] = useState("");
  const [dismissedCleanupIds, setDismissedCleanupIds] = useState(new Set());

  // Search, organization & pagination state.
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState("keyword");
  const [selectedMemoryDetail, setSelectedMemoryDetail] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("updated_at");
  const [sortOrder, setSortOrder] = useState("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Import state.
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [importNotice, setImportNotice] = useState("");
  const [importFile, setImportFile] = useState(null);
  const [importRawData, setImportRawData] = useState("");
  const [importFormat, setImportFormat] = useState("json");
  const [importPreview, setImportPreview] = useState(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  const currentProposal = consolidationProposals[activeProposalIndex] || null;

  useEffect(() => {
    if (currentProposal) {
      setEditedConsolidatedContent(currentProposal.suggested_content);
      setEditedConsolidatedCategory(currentProposal.category);
    }
  }, [currentProposal]);

  async function handleFindConsolidations() {
    setConsolidating(true);
    setConsolidationNotice("");
    setConsolidationError("");

    try {
      const data = await getConsolidationProposals();
      if (!data.proposals || data.proposals.length === 0) {
        setConsolidationNotice(
          "No consolidation opportunities found. Your memories are clear and distinct."
        );
        setConsolidationProposals([]);
      } else {
        setConsolidationProposals(data.proposals);
        setActiveProposalIndex(0);
        setConsolidationNotice("");
      }
    } catch (err) {
      setConsolidationError(err.message || "Failed to find consolidation suggestions.");
    } finally {
      setConsolidating(false);
    }
  }

  async function handleApproveProposal() {
    if (!currentProposal) return;
    const trimmed = editedConsolidatedContent.trim();
    if (!trimmed) {
      setConsolidationError("Consolidated memory content cannot be empty.");
      return;
    }

    setApplyingProposal(true);
    setConsolidationError("");

    try {
      const result = await applyConsolidationProposal({
        original_memory_ids: currentProposal.original_memory_ids,
        consolidated_content: trimmed,
        category: editedConsolidatedCategory,
        sources_fingerprint: currentProposal.sources_fingerprint,
      });

      setSuccess(
        `Consolidated successfully into memory #${result.consolidated_memory.id}. ${result.archived_memory_ids.length} original memories archived.`
      );
      await loadMemories();

      const remaining = consolidationProposals.filter((_, idx) => idx !== activeProposalIndex);
      setConsolidationProposals(remaining);
      if (activeProposalIndex >= remaining.length) {
        setActiveProposalIndex(Math.max(0, remaining.length - 1));
      }
      if (remaining.length === 0) {
        setConsolidationNotice("All consolidation proposals processed.");
      }
    } catch (err) {
      setConsolidationError(err.message || "Failed to apply consolidation proposal.");
    } finally {
      setApplyingProposal(false);
    }
  }

  function handleRejectProposal() {
    if (!currentProposal) return;
    const remaining = consolidationProposals.filter((_, idx) => idx !== activeProposalIndex);
    setConsolidationProposals(remaining);
    if (activeProposalIndex >= remaining.length) {
      setActiveProposalIndex(Math.max(0, remaining.length - 1));
    }
    setConsolidationNotice("Proposal dismissed.");
    if (remaining.length === 0) {
      setConsolidationNotice("All proposals reviewed.");
    }
  }

  function handleDismissAllProposals() {
    setConsolidationProposals([]);
    setConsolidationNotice("");
    setConsolidationError("");
  }

  async function loadMemories() {
    setLoading(true);
    setError("");

    try {
      const searchParams = {
        q: searchQuery,
        category: filter,
        importance: importanceFilter,
        status: statusFilter,
        sort_by: sortBy,
        sort_order: sortOrder,
        page,
        page_size: pageSize,
      };

      if (searchQuery.trim() && searchMode !== "keyword") {
        searchParams.search_mode = searchMode;
      }

      const data = await searchMemories(searchParams);
      setMemories(data.items);
      setTotalCount(data.total_count);
      setTotalPages(data.total_pages);
    } catch (err) {
      setError(err.message || "Unable to load memories.");
    } finally {
      setLoading(false);
    }
  }

  async function handleExportJson() {
    setError("");
    setSuccess("");
    try {
      const data = await exportMemoriesJson();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `edith_memories_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setSuccess("JSON export downloaded successfully.");
    } catch (err) {
      setError(err.message || "Failed to export JSON.");
    }
  }

  async function handleExportCsv() {
    setError("");
    setSuccess("");
    try {
      const csvText = await exportMemoriesCsv();
      const blob = new Blob([csvText], {
        type: "text/csv;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `edith_memories_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setSuccess("CSV export downloaded successfully.");
    } catch (err) {
      setError(err.message || "Failed to export CSV.");
    }
  }

  function handleImportFileSelect(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    let format = "json";
    if (fileName.endsWith(".csv")) {
      format = "csv";
    } else if (!fileName.endsWith(".json")) {
      setImportError("Unsupported file type. Please select a .json or .csv file.");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setImportError("File size exceeds 2MB limit.");
      return;
    }

    setImporting(true);
    setImportError("");
    setImportNotice("");
    setImportFile(file);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target.result;
        setImportRawData(text);
        setImportFormat(format);
        const preview = await previewMemoryImport(format, text);
        setImportPreview(preview);
      } catch (err) {
        setImportError(err.message || "Failed to generate import preview.");
        setImportPreview(null);
      } finally {
        setImporting(false);
      }
    };
    reader.onerror = () => {
      setImportError("Failed to read selected file.");
      setImporting(false);
    };
    reader.readAsText(file);
  }

  async function handleConfirmImport() {
    if (!importPreview || importPreview.valid_count === 0) return;

    const validRecords = importPreview.records
      .filter((r) => r.is_valid && (!skipDuplicates || !r.is_duplicate))
      .map((r) => ({
        id: r.id,
        content: r.content,
        category: r.category,
        importance: r.importance,
        expires_at: r.expires_at,
        is_archived: r.is_archived,
        archived_at: r.archived_at,
        consolidated_into_id: r.consolidated_into_id,
        usage_count: r.usage_count,
      }));

    if (validRecords.length === 0) {
      setImportError("No records eligible for import based on duplicate settings.");
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to import ${validRecords.length} memory records into your knowledge base?`
    );
    if (!confirmed) return;

    setImporting(true);
    setImportError("");
    setImportNotice("");

    try {
      const res = await confirmMemoryImport(validRecords, skipDuplicates);
      setSuccess(
        `Import complete! ${res.imported_count} memories imported (${res.skipped_count} skipped).`
      );
      setImportPreview(null);
      setImportFile(null);
      setShowImportPanel(false);
      await loadMemories();
    } catch (err) {
      setImportError(err.message || "Failed to import memories.");
    } finally {
      setImporting(false);
    }
  }

  async function handleUnarchive(memoryId) {
    setError("");
    setSuccess("");
    try {
      await unarchiveMemory(memoryId);
      setSuccess(`Archived memory #${memoryId} restored to active status.`);
      await loadMemories();
    } catch (err) {
      setError(err.message || "Failed to activate archived memory.");
    }
  }

  function handleCancelImport() {
    setShowImportPanel(false);
    setImportPreview(null);
    setImportFile(null);
    setImportError("");
    setImportNotice("");
  }

  async function handleRestoreConsolidation(memoryId) {
    const confirmed = window.confirm(
      "Are you sure you want to restore the original memories? This will un-archive the original memories and remove this consolidated memory."
    );
    if (!confirmed) return;

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const res = await restoreConsolidatedMemory(memoryId);
      setSuccess(
        `Consolidation reversed! Restored ${res.restored_memory_ids.length} original memories and removed consolidated memory.`
      );
      await loadMemories();
    } catch (err) {
      setError(err.message || "Failed to restore consolidated memory.");
    } finally {
      setLoading(false);
    }
  }

  async function handleReviewCleanup() {
    setReviewingCleanup(true);
    setCleanupError("");
    setCleanupNotice("");

    try {
      const review = await getMemoryCleanupReview(true);
      setCleanupReview(review);
      setDismissedCleanupIds(new Set());
      const totalCandidates =
        review.expired_count +
        review.unused_count +
        review.rarely_used_count +
        review.potentially_outdated_count;
      if (totalCandidates === 0) {
        setCleanupNotice(
          "All active memories appear fresh and actively used. No cleanup needed."
        );
      }
    } catch (err) {
      setCleanupError(err.message || "Failed to load memory cleanup review.");
    } finally {
      setReviewingCleanup(false);
    }
  }

  function handleKeepCleanupMemory(memoryId) {
    setDismissedCleanupIds((prev) => new Set(prev).add(memoryId));
    setSuccess("Memory retained and dismissed from cleanup review.");
  }

  async function handleCleanupDelete(memoryId) {
    const confirmed = window.confirm(
      "Are you sure you want to permanently delete this memory?"
    );
    if (!confirmed) return;

    setError("");
    setSuccess("");

    try {
      await deleteMemory(memoryId);
      setDismissedCleanupIds((prev) => new Set(prev).add(memoryId));
      setSuccess("Memory deleted successfully.");
      await loadMemories();
    } catch (err) {
      setError(err.message || "Unable to delete memory.");
    }
  }

  function renderCleanupGroup(title, items, groupBadgeText, isAi) {
    const activeItems = (items || []).filter(
      (item) => !dismissedCleanupIds.has(item.id)
    );

    return (
      <div className="memory-cleanup-group">
        <div className="memory-cleanup-group-header">
          <div className="cleanup-group-title">
            <h4>{title}</h4>
            <span className="cleanup-group-count">({activeItems.length})</span>
          </div>
          <span className={isAi ? "cleanup-badge-ai" : "cleanup-badge-deterministic"}>
            {isAi ? "AI SUGGESTION" : "DETERMINISTIC RULE"}
          </span>
        </div>

        {activeItems.length === 0 ? (
          <p className="cleanup-group-empty">No memories flagged in this category.</p>
        ) : (
          <div className="cleanup-group-cards">
            {activeItems.map((item) => (
              <article className="cleanup-card" key={item.id}>
                <div className="cleanup-card-top">
                  <div className="cleanup-card-labels">
                    <span className="memory-category">
                      {formatLabel(item.category)}
                    </span>
                    <span className={`memory-importance memory-importance-${item.importance || "normal"}`}>
                      {formatLabel(item.importance || "normal")}
                    </span>
                    <span className="cleanup-card-flag-badge">
                      {groupBadgeText}
                    </span>
                  </div>
                  <span className="memory-id">MEMORY #{item.id}</span>
                </div>

                <div className="cleanup-reason-banner">
                  <strong>REASON:</strong> {item.reason}
                </div>

                <p className="cleanup-card-content">{item.content}</p>

                <div className="cleanup-card-meta">
                  <span>USES: {item.usage_count || 0}</span>
                  <span>
                    LAST USED:{" "}
                    {item.last_used_at
                      ? formatDate(item.last_used_at)
                      : "NEVER"}
                  </span>
                  {item.expires_at && (
                    <span>
                      EXPIRES: {formatDate(item.expires_at)}
                    </span>
                  )}
                </div>

                <div className="cleanup-card-actions">
                  <button
                    type="button"
                    className="cleanup-keep-button"
                    onClick={() => handleKeepCleanupMemory(item.id)}
                    title="Keep this memory and dismiss from cleanup review"
                  >
                    KEEP MEMORY
                  </button>
                  <button
                    type="button"
                    className="cleanup-edit-button"
                    onClick={() => handleEdit(item)}
                    title="Edit this memory"
                  >
                    EDIT
                  </button>
                  <button
                    type="button"
                    className="cleanup-delete-button"
                    onClick={() => handleCleanupDelete(item.id)}
                    title="Permanently delete this memory"
                  >
                    DELETE
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    );
  }

  useEffect(() => {
    loadMemories();
  }, [searchQuery, searchMode, filter, importanceFilter, statusFilter, sortBy, sortOrder, page, pageSize]);

  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    searchMode !== "keyword" ||
    filter !== "all" ||
    importanceFilter !== "all" ||
    statusFilter !== "all" ||
    sortBy !== "updated_at" ||
    sortOrder !== "desc";

  function clearAllFilters() {
    setSearchQuery("");
    setSearchMode("keyword");
    setFilter("all");
    setImportanceFilter("all");
    setStatusFilter("all");
    setSortBy("updated_at");
    setSortOrder("desc");
    setPage(1);
  }

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

  // Create a new memory after duplicate review.
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

      // Check possible duplicates before creating a memory.
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

  function formatLabel(value) {
    return value
      ? value.replaceAll("_", " ").toUpperCase()
      : "NORMAL";
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
                {formatLabel(item)}
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
                  Category: {formatLabel(pendingMemory.category)}
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
                    Category: {formatLabel(match.category)}
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

            <div className="memory-header-actions">
              <button
                type="button"
                className="memory-export-button"
                onClick={handleExportJson}
                disabled={loading || consolidating || reviewingCleanup}
                title="Export memories as JSON"
              >
                EXPORT JSON
              </button>

              <button
                type="button"
                className="memory-export-button"
                onClick={handleExportCsv}
                disabled={loading || consolidating || reviewingCleanup}
                title="Export memories as CSV"
              >
                EXPORT CSV
              </button>

              <button
                type="button"
                className="memory-import-toggle-button"
                onClick={() => setShowImportPanel((prev) => !prev)}
                disabled={loading || consolidating || reviewingCleanup}
                title="Import memories from JSON or CSV"
              >
                {showImportPanel ? "HIDE IMPORT" : "IMPORT"}
              </button>

              <button
                type="button"
                className="memory-cleanup-button"
                onClick={handleReviewCleanup}
                disabled={loading || consolidating || reviewingCleanup || saving}
                title="Review expired, unused, rarely used, and outdated memories"
              >
                {reviewingCleanup ? "SCANNING..." : "REVIEW CLEANUP"}
              </button>

              <button
                type="button"
                className="memory-consolidate-button"
                onClick={handleFindConsolidations}
                disabled={loading || consolidating || reviewingCleanup || saving}
                title="Find related memories and propose combining them"
              >
                {consolidating ? "ANALYZING..." : "CONSOLIDATE MEMORIES"}
              </button>

              <button
                type="button"
                className="memory-refresh-button"
                onClick={loadMemories}
                disabled={loading || consolidating || reviewingCleanup}
              >
                REFRESH
              </button>
            </div>
          </div>

          {consolidationNotice && (
            <div className="memory-consolidation-notice">
              <span>✦</span>
              <p>{consolidationNotice}</p>
              <button
                type="button"
                onClick={() => setConsolidationNotice("")}
                aria-label="Dismiss notice"
              >
                ✕
              </button>
            </div>
          )}

          {consolidationError && (
            <div className="memory-consolidation-error">
              <span>⚠</span>
              <p>{consolidationError}</p>
              <button
                type="button"
                onClick={() => setConsolidationError("")}
                aria-label="Dismiss error"
              >
                ✕
              </button>
            </div>
          )}

          {currentProposal && (
            <div className="memory-consolidation-panel">
              <div className="memory-consolidation-header">
                <div className="memory-consolidation-title">
                  <h3>CONSOLIDATION PROPOSAL</h3>
                  <span className="memory-consolidation-counter">
                    PROPOSAL {activeProposalIndex + 1} OF {consolidationProposals.length}
                  </span>
                </div>
                <button
                  type="button"
                  className="memory-consolidation-close"
                  onClick={handleDismissAllProposals}
                  title="Close consolidation review"
                >
                  ✕
                </button>
              </div>

              <div className="memory-consolidation-explanation">
                <strong>WHY CONSOLIDATE:</strong> {currentProposal.explanation}
              </div>

              <div className="memory-consolidation-grid">
                <div className="memory-consolidation-sources">
                  <h4>ORIGINAL MEMORIES ({currentProposal.memory_count})</h4>
                  <div className="memory-consolidation-sources-list">
                    {currentProposal.original_memories.map((orig) => (
                      <article key={orig.id} className="memory-consolidation-source-item">
                        <div className="memory-consolidation-source-meta">
                          <span className="memory-id">MEMORY #{orig.id}</span>
                          <span className="memory-category">{formatLabel(orig.category)}</span>
                          <span className={`memory-importance memory-importance-${orig.importance || "normal"}`}>
                            {formatLabel(orig.importance || "normal")}
                          </span>
                        </div>
                        <p className="memory-consolidation-source-content">{orig.content}</p>
                      </article>
                    ))}
                  </div>
                </div>

                <div className="memory-consolidation-target">
                  <h4>PROPOSED CONSOLIDATED MEMORY (EDITABLE)</h4>
                  <label htmlFor="consolidation-content-edit" className="visually-hidden">
                    Edit consolidated memory content
                  </label>
                  <textarea
                    id="consolidation-content-edit"
                    value={editedConsolidatedContent}
                    onChange={(e) => setEditedConsolidatedContent(e.target.value)}
                    rows={5}
                    disabled={applyingProposal}
                    className="memory-consolidation-textarea"
                    placeholder="Review and edit the consolidated content..."
                    maxLength={10000}
                  />

                  <div className="memory-consolidation-category-row">
                    <label htmlFor="consolidation-category-select">CATEGORY</label>
                    <select
                      id="consolidation-category-select"
                      value={editedConsolidatedCategory}
                      onChange={(e) => setEditedConsolidatedCategory(e.target.value)}
                      disabled={applyingProposal}
                    >
                      {categories.map((c) => (
                        <option key={c} value={c}>
                          {formatLabel(c)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="memory-consolidation-actions">
                <div className="memory-consolidation-main-buttons">
                  <button
                    type="button"
                    className="memory-consolidate-approve-btn"
                    onClick={handleApproveProposal}
                    disabled={applyingProposal || !editedConsolidatedContent.trim()}
                  >
                    {applyingProposal ? "APPLYING..." : "APPROVE & CONSOLIDATE"}
                  </button>

                  <button
                    type="button"
                    className="memory-consolidate-reject-btn"
                    onClick={handleRejectProposal}
                    disabled={applyingProposal}
                  >
                    REJECT / SKIP
                  </button>
                </div>

                {consolidationProposals.length > 1 && (
                  <div className="memory-consolidation-nav">
                    <button
                      type="button"
                      onClick={() => setActiveProposalIndex((prev) => Math.max(0, prev - 1))}
                      disabled={activeProposalIndex === 0 || applyingProposal}
                    >
                      ◀ PREV
                    </button>
                    <span>
                      {activeProposalIndex + 1} / {consolidationProposals.length}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setActiveProposalIndex((prev) =>
                          Math.min(consolidationProposals.length - 1, prev + 1)
                        )
                      }
                      disabled={
                        activeProposalIndex === consolidationProposals.length - 1 ||
                        applyingProposal
                      }
                    >
                      NEXT ▶
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {cleanupNotice && (
            <div className="memory-cleanup-notice">
              <span>✦</span>
              <p>{cleanupNotice}</p>
              <button
                type="button"
                onClick={() => setCleanupNotice("")}
                aria-label="Dismiss notice"
              >
                ✕
              </button>
            </div>
          )}

          {cleanupError && (
            <div className="memory-cleanup-error">
              <span>⚠</span>
              <p>{cleanupError}</p>
              <button
                type="button"
                onClick={() => setCleanupError("")}
                aria-label="Dismiss error"
              >
                ✕
              </button>
            </div>
          )}

          {cleanupReview && (
            <div className="memory-cleanup-panel">
              <div className="memory-cleanup-header">
                <div>
                  <h3>MEMORY RETENTION &amp; CLEANUP</h3>
                  <p className="memory-cleanup-subtitle">
                    Advisory recommendations to keep your personal knowledge system organized.
                    Recommendations are read-only; no memories are modified or deleted automatically.
                  </p>
                </div>

                <button
                  type="button"
                  className="memory-cleanup-close"
                  onClick={() => setCleanupReview(null)}
                  title="Close cleanup review"
                >
                  ✕ CLOSE REVIEW
                </button>
              </div>

              <div className="memory-cleanup-summary">
                <div className="cleanup-summary-item">
                  <span className="summary-num">{cleanupReview.total_active_memories}</span>
                  <span className="summary-label">ACTIVE MEMORIES</span>
                </div>
                <div className="cleanup-summary-item">
                  <span className="summary-num">{cleanupReview.expired_count}</span>
                  <span className="summary-label">EXPIRED</span>
                </div>
                <div className="cleanup-summary-item">
                  <span className="summary-num">{cleanupReview.unused_count}</span>
                  <span className="summary-label">UNUSED (0 USES)</span>
                </div>
                <div className="cleanup-summary-item">
                  <span className="summary-num">{cleanupReview.rarely_used_count}</span>
                  <span className="summary-label">RARELY USED</span>
                </div>
                <div className="cleanup-summary-item">
                  <span className="summary-num">{cleanupReview.potentially_outdated_count}</span>
                  <span className="summary-label">POTENTIALLY OUTDATED</span>
                </div>
              </div>

              {renderCleanupGroup(
                "EXPIRED MEMORIES",
                cleanupReview.expired_memories,
                "EXPIRED",
                false
              )}

              {renderCleanupGroup(
                "UNUSED MEMORIES",
                cleanupReview.unused_memories,
                "UNUSED",
                false
              )}

              {renderCleanupGroup(
                "RARELY USED MEMORIES",
                cleanupReview.rarely_used_memories,
                "RARELY USED",
                false
              )}

              {renderCleanupGroup(
                "POTENTIALLY OUTDATED MEMORIES",
                cleanupReview.potentially_outdated_memories,
                "POTENTIALLY OUTDATED",
                true
              )}
            </div>
          )}

          {showImportPanel && (
            <div className="memory-import-panel">
              <div className="memory-import-header">
                <div>
                  <h3>IMPORT MEMORIES</h3>
                  <p className="memory-import-subtitle">
                    Import memories from a JSON or CSV file. All records are validated and previewed before saving.
                  </p>
                </div>
                <button
                  type="button"
                  className="memory-import-close"
                  onClick={handleCancelImport}
                  title="Close import panel"
                >
                  ✕
                </button>
              </div>

              {importNotice && (
                <div className="memory-import-notice">
                  <span>✦</span>
                  <p>{importNotice}</p>
                </div>
              )}

              {importError && (
                <div className="memory-import-error">
                  <span>⚠</span>
                  <p>{importError}</p>
                </div>
              )}

              <div className="memory-import-upload-row">
                <label className="memory-import-file-btn">
                  <span>SELECT FILE (.JSON / .CSV)</span>
                  <input
                    type="file"
                    accept=".json,.csv"
                    onChange={handleImportFileSelect}
                    disabled={importing}
                    style={{ display: "none" }}
                  />
                </label>
                {importFile && (
                  <span className="memory-import-filename">
                    {importFile.name} ({(importFile.size / 1024).toFixed(1)} KB)
                  </span>
                )}
                {importing && <span className="memory-import-loading">Processing file...</span>}
              </div>

              {importPreview && (
                <div className="memory-import-preview-section">
                  <div className="memory-import-metrics">
                    <div className="import-metric-badge">
                      <strong>{importPreview.total_records}</strong>
                      <span>TOTAL RECORDS</span>
                    </div>
                    <div className="import-metric-badge valid">
                      <strong>{importPreview.valid_count}</strong>
                      <span>VALID</span>
                    </div>
                    <div className="import-metric-badge duplicate">
                      <strong>{importPreview.duplicate_count}</strong>
                      <span>DUPLICATES</span>
                    </div>
                    <div className="import-metric-badge invalid">
                      <strong>{importPreview.invalid_count}</strong>
                      <span>INVALID</span>
                    </div>
                  </div>

                  <div className="memory-import-options">
                    <label className="memory-import-checkbox-label">
                      <input
                        type="checkbox"
                        checked={skipDuplicates}
                        onChange={(e) => setSkipDuplicates(e.target.checked)}
                        disabled={importing}
                      />
                      <span>Skip duplicates during import ({importPreview.duplicate_count} existing match)</span>
                    </label>
                  </div>

                  <div className="memory-import-table-container">
                    <table className="memory-import-table">
                      <thead>
                        <tr>
                          <th>STATUS</th>
                          <th>CONTENT</th>
                          <th>CATEGORY</th>
                          <th>IMPORTANCE</th>
                          <th>DETAILS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.records.map((rec, idx) => (
                          <tr key={idx} className={`import-row-${rec.is_valid ? (rec.is_duplicate ? "duplicate" : "valid") : "invalid"}`}>
                            <td>
                              <span className={`import-status-tag ${rec.is_valid ? (rec.is_duplicate ? "tag-duplicate" : "tag-valid") : "tag-invalid"}`}>
                                {!rec.is_valid ? "INVALID" : rec.is_duplicate ? "DUPLICATE" : "VALID"}
                              </span>
                            </td>
                            <td className="import-col-content">{rec.content || <em className="dim">(empty)</em>}</td>
                            <td>{formatLabel(rec.category || "other")}</td>
                            <td>{formatLabel(rec.importance || "normal")}</td>
                            <td className="import-col-details">
                              {rec.validation_error || (rec.is_duplicate ? "Duplicate of active memory" : (rec.lineage_status ? `Valid (${formatLabel(rec.lineage_status)})` : "Ready to import"))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="memory-import-actions">
                    <button
                      type="button"
                      className="memory-import-confirm-btn"
                      onClick={handleConfirmImport}
                      disabled={importing || importPreview.valid_count === 0}
                    >
                      {importing
                        ? "IMPORTING..."
                        : `CONFIRM & IMPORT (${skipDuplicates ? importPreview.valid_count - importPreview.duplicate_count : importPreview.valid_count} RECORDS)`}
                    </button>
                    <button
                      type="button"
                      className="memory-import-cancel-btn"
                      onClick={handleCancelImport}
                      disabled={importing}
                    >
                      CANCEL
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Search bar */}
          <div className="memory-search-bar">
            <div className="memory-search-input-wrap">
              <span className="memory-search-icon">🔍</span>
              <input
                type="text"
                className="memory-search-input"
                placeholder={
                  searchMode === "semantic"
                    ? "Semantic search (e.g., 'dark theme preference')..."
                    : searchMode === "hybrid"
                    ? "Hybrid search (keyword + semantic similarity)..."
                    : "Search memory content..."
                }
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="memory-search-clear"
                  onClick={() => {
                    setSearchQuery("");
                    setPage(1);
                  }}
                  title="Clear search"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="memory-search-mode-wrap">
              <label htmlFor="memory-search-mode-select">MODE</label>
              <select
                id="memory-search-mode-select"
                className="memory-search-mode-select"
                value={searchMode}
                onChange={(e) => {
                  setSearchMode(e.target.value);
                  setPage(1);
                }}
                title="Select search retrieval mode"
              >
                <option value="keyword">Keyword (ILIKE)</option>
                <option value="semantic">Semantic (pgvector)</option>
                <option value="hybrid">Hybrid (Combined)</option>
              </select>
            </div>
          </div>

          {/* Filter & Sort Bar */}
          <div className="memory-filter-bar">
            <div className="memory-filter-group">
              <label htmlFor="memory-status-select">STATUS</label>
              <select
                id="memory-status-select"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">ALL STATUSES</option>
                <option value="active">ACTIVE</option>
                <option value="expired">EXPIRED</option>
                <option value="archived">ARCHIVED</option>
              </select>
            </div>

            <div className="memory-filter-group">
              <label htmlFor="memory-category-select">CATEGORY</label>
              <select
                id="memory-category-select"
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">ALL CATEGORIES</option>
                {categories.map((item) => (
                  <option key={item} value={item}>
                    {formatLabel(item)}
                  </option>
                ))}
              </select>
            </div>

            <div className="memory-filter-group">
              <label htmlFor="memory-importance-select">IMPORTANCE</label>
              <select
                id="memory-importance-select"
                value={importanceFilter}
                onChange={(e) => {
                  setImportanceFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">ALL IMPORTANCE</option>
                {importanceLevels.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {formatLabel(lvl)}
                  </option>
                ))}
              </select>
            </div>

            <div className="memory-filter-group">
              <label htmlFor="memory-sortby-select">SORT BY</label>
              <select
                id="memory-sortby-select"
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value);
                  setPage(1);
                }}
              >
                <option value="updated_at">UPDATED DATE</option>
                <option value="created_at">CREATED DATE</option>
                <option value="importance">IMPORTANCE</option>
                <option value="usage_count">USAGE COUNT</option>
              </select>
            </div>

            <div className="memory-filter-group memory-sort-direction-group">
              <label>ORDER</label>
              <button
                type="button"
                className="memory-sort-toggle-btn"
                onClick={() => setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))}
                title={`Sort ${sortOrder === "asc" ? "Ascending" : "Descending"} (Click to flip)`}
              >
                {sortOrder === "asc" ? "▲ ASC" : "▼ DESC"}
              </button>
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                className="memory-reset-filters-btn"
                onClick={clearAllFilters}
                title="Reset all search filters and sorting"
              >
                RESET ALL
              </button>
            )}
          </div>

          {/* Results count & Pagination controls */}
          <div className="memory-results-bar">
            <div className="memory-results-count">
              Showing {memories.length} of {totalCount} memories
            </div>

            {totalPages > 1 && (
              <div className="memory-pagination">
                <button
                  type="button"
                  className="memory-page-btn"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  ◀ PREV
                </button>
                <span className="memory-page-info">
                  PAGE {page} OF {totalPages}
                </span>
                <button
                  type="button"
                  className="memory-page-btn"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  NEXT ▶
                </button>
              </div>
            )}
          </div>

          {loading ? (
            <p className="memory-empty">
              Loading memories...
            </p>
          ) : memories.length === 0 ? (
            <div className="memory-empty">
              <span className="memory-empty-icon">✦</span>
              <h3>No memories found</h3>
              <p>
                {hasActiveFilters
                  ? "No memories match the selected filters."
                  : "Add a memory to begin building E.D.I.T.H.'s knowledge."}
              </p>
            </div>
          ) : (
            <div className="memory-list">
              {memories.map((memory) => (
                <article
                  className="memory-card"
                  key={memory.id}
                >
                  <div className="memory-card-top">
                    <div className="memory-card-labels">
                      <span className="memory-category">
                        {formatLabel(memory.category)}
                      </span>

                      <span
                        className={`memory-importance memory-importance-${memory.importance || "normal"}`}
                      >
                        {formatLabel(memory.importance || "normal")}
                      </span>

                      {memory.has_archived_sources && (
                        <span className="memory-badge-consolidated">
                          CONSOLIDATED
                        </span>
                      )}

                      {memory.is_archived && (
                        memory.consolidated_into_id ? (
                          <span
                            className="memory-badge-archived-linked"
                            title={`Archived into consolidated memory #${memory.consolidated_into_id}. Restore memory #${memory.consolidated_into_id} to restore this memory.`}
                          >
                            ARCHIVED (LINKED #{memory.consolidated_into_id})
                          </span>
                        ) : (
                          <span
                            className="memory-badge-archived-backup"
                            title="Independent archived backup. Can be activated directly."
                          >
                            ARCHIVED (BACKUP)
                          </span>
                        )
                      )}
                    </div>

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
                      {memory.has_archived_sources && (
                        <button
                          type="button"
                          className="memory-restore-button"
                          onClick={() => handleRestoreConsolidation(memory.id)}
                          title="Restore original memories and delete this consolidated memory"
                        >
                          RESTORE ORIGINALS
                        </button>
                      )}

                      {memory.is_archived && !memory.consolidated_into_id && (
                        <button
                          type="button"
                          className="memory-unarchive-button"
                          onClick={() => handleUnarchive(memory.id)}
                          title="Activate this independent archived backup memory"
                        >
                          ACTIVATE BACKUP
                        </button>
                      )}

                      <button
                        type="button"
                        className="memory-details-button"
                        onClick={() => setSelectedMemoryDetail(memory)}
                        title="View complete memory metadata and details"
                      >
                        DETAILS
                      </button>

                      <button
                        type="button"
                        onClick={() => handleEdit(memory)}
                      >
                        EDIT
                      </button>

                      <button
                        type="button"
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

          {totalPages > 1 && (
            <div className="memory-pagination memory-pagination-bottom">
              <button
                type="button"
                className="memory-page-btn"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                ◀ PREV
              </button>
              <span className="memory-page-info">
                PAGE {page} OF {totalPages}
              </span>
              <button
                type="button"
                className="memory-page-btn"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                NEXT ▶
              </button>
            </div>
          )}

          {/* Memory Details Modal */}
          {selectedMemoryDetail && (
            <div className="memory-modal-overlay" onClick={() => setSelectedMemoryDetail(null)}>
              <div className="memory-modal-card" onClick={(e) => e.stopPropagation()}>
                <div className="memory-modal-header">
                  <div className="memory-modal-title">
                    <span className="modal-title-dot" />
                    <h3>MEMORY #{selectedMemoryDetail.id} DETAILS</h3>
                  </div>
                  <button
                    type="button"
                    className="memory-modal-close"
                    onClick={() => setSelectedMemoryDetail(null)}
                  >
                    ✕
                  </button>
                </div>

                <div className="memory-modal-body">
                  <div className="modal-detail-row">
                    <span className="detail-label">CONTENT</span>
                    <p className="detail-content">{selectedMemoryDetail.content}</p>
                  </div>

                  <div className="modal-detail-grid">
                    <div className="modal-grid-item">
                      <span className="detail-label">CATEGORY</span>
                      <span className="detail-badge category">{formatLabel(selectedMemoryDetail.category)}</span>
                    </div>

                    <div className="modal-grid-item">
                      <span className="detail-label">IMPORTANCE</span>
                      <span className={`detail-badge importance-${selectedMemoryDetail.importance || "normal"}`}>
                        {formatLabel(selectedMemoryDetail.importance || "normal")}
                      </span>
                    </div>

                    <div className="modal-grid-item">
                      <span className="detail-label">STATUS</span>
                      <span className={`detail-badge status-${selectedMemoryDetail.is_archived ? "archived" : "active"}`}>
                        {selectedMemoryDetail.is_archived ? "ARCHIVED" : "ACTIVE"}
                      </span>
                    </div>

                    <div className="modal-grid-item">
                      <span className="detail-label">USAGE COUNT</span>
                      <span className="detail-value">{selectedMemoryDetail.usage_count ?? 0}</span>
                    </div>

                    <div className="modal-grid-item">
                      <span className="detail-label">LAST USED</span>
                      <span className="detail-value">
                        {selectedMemoryDetail.last_used_at ? formatDate(selectedMemoryDetail.last_used_at) : "Never"}
                      </span>
                    </div>

                    <div className="modal-grid-item">
                      <span className="detail-label">EXPIRES AT</span>
                      <span className="detail-value">
                        {selectedMemoryDetail.expires_at ? formatDate(selectedMemoryDetail.expires_at) : "Never"}
                      </span>
                    </div>

                    <div className="modal-grid-item">
                      <span className="detail-label">CREATED AT</span>
                      <span className="detail-value">{formatDate(selectedMemoryDetail.created_at)}</span>
                    </div>

                    <div className="modal-grid-item">
                      <span className="detail-label">UPDATED AT</span>
                      <span className="detail-value">{formatDate(selectedMemoryDetail.updated_at)}</span>
                    </div>

                    <div className="modal-grid-item full-width">
                      <span className="detail-label">VECTOR EMBEDDING</span>
                      <div className="vector-status-pill">
                        <span className="vector-dot" />
                        <span>1024-dimensional BGE-M3 dense vector registered in pgvector</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="memory-modal-footer">
                  <button
                    type="button"
                    className="modal-action-btn edit"
                    onClick={() => {
                      const m = selectedMemoryDetail;
                      setSelectedMemoryDetail(null);
                      handleEdit(m);
                    }}
                  >
                    Edit Memory
                  </button>
                  <button
                    type="button"
                    className="modal-action-btn close"
                    onClick={() => setSelectedMemoryDetail(null)}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </section>
  );
}

export default Memory;
