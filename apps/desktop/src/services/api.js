
const API_BASE_URL = "http://127.0.0.1:8000";

let currentSession = null;
let refreshPromise = null;

// ==============================
// SESSION MANAGEMENT
// ==============================

export function setCurrentSession(session) {
  currentSession = session;
}

export function clearCurrentSession() {
  currentSession = null;
  refreshPromise = null;
}

async function refreshSession() {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    if (!currentSession?.refresh_token) {
      throw new Error("No refresh token available.");
    }

    const response = await fetch(
      `${API_BASE_URL}/api/v1/auth/refresh`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          refresh_token: currentSession.refresh_token,
        }),
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.detail || "Session renewal failed."
      );
    }

    const updatedSession = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      session_id: data.session_id,
    };

    await window.edith.setAuthSession(updatedSession);

    currentSession = updatedSession;

    return updatedSession;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

// ==============================
// COMMON API HELPER
// ==============================

async function apiRequest(endpoint, options = {}, authenticated = false) {
  const makeRequest = async (token = null) => {
    const headers = {
      "Content-Type": "application/json",
      ...options.headers,
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    return fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });
  };

  let response = await makeRequest(
    authenticated ? currentSession?.access_token : null
  );

  if (response.status === 401 && authenticated) {
    try {
      await refreshSession();

      response = await makeRequest(
        currentSession.access_token
      );
    } catch (error) {
      await window.edith?.clearAuthSession();
      clearCurrentSession();

      throw new Error(
        "Your session has expired. Please sign in again."
      );
    }
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.detail || `Request failed with status ${response.status}.`
    );
  }

  return data;
}

// ==============================
// BACKEND HEALTH
// ==============================

export async function checkBackendHealth() {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/v1/health`
    );

    return response.ok;
  } catch {
    return false;
  }
}

// ==============================
// AUTHENTICATION
// ==============================

export async function registerUser(username, email, password) {
  return apiRequest(
    "/api/v1/auth/register",
    {
      method: "POST",
      body: JSON.stringify({
        username,
        email,
        password,
      }),
    }
  );
}

export async function loginUser(identifier, password) {
  return apiRequest(
    "/api/v1/auth/login",
    {
      method: "POST",
      body: JSON.stringify({
        identifier,
        password,
        device_name: "E.D.I.T.H Desktop",
      }),
    }
  );
}

export async function logoutUser() {
  if (!currentSession?.refresh_token) {
    clearCurrentSession();
    await window.edith?.clearAuthSession();
    return;
  }

  try {
    await apiRequest(
      "/api/v1/auth/logout",
      {
        method: "POST",
        body: JSON.stringify({
          refresh_token: currentSession.refresh_token,
        }),
      }
    );
  } finally {
    clearCurrentSession();
    await window.edith?.clearAuthSession();
  }
}

export async function getSessions() {
  return apiRequest(
    "/api/v1/auth/sessions",
    {},
    true
  );
}

export async function revokeSession(sessionId) {
  return apiRequest(
    `/api/v1/auth/sessions/${sessionId}`,
    {
      method: "DELETE",
    },
    true
  );
}

// ==============================
// CHAT
// ==============================

export async function sendChatMessage(message, conversationId = null) {
  return apiRequest(
    "/api/v1/chat/",
    {
      method: "POST",
      body: JSON.stringify({
        message,
        conversation_id: conversationId,
      }),
    },
    true
  );
}

// ==============================
// CONVERSATION HISTORY
// ==============================

export async function getConversations() {
  return apiRequest(
    "/api/v1/chat/conversations",
    {},
    true
  );
}

export async function getConversation(conversationId) {
  return apiRequest(
    `/api/v1/chat/conversations/${conversationId}`,
    {},
    true
  );
}

export async function deleteConversation(conversationId) {
  return apiRequest(
    `/api/v1/chat/conversations/${conversationId}`,
    {
      method: "DELETE",
    },
    true
  );
}

// ==============================
// LONG-TERM MEMORY
// ==============================

export async function getMemories() {
  return apiRequest(
    "/api/v1/memory/",
    {},
    true
  );
}

export async function getMemory(memoryId) {
  return apiRequest(
    `/api/v1/memory/${memoryId}`,
    {},
    true
  );
}

export async function createMemory(content, category = "other") {
  return apiRequest(
    "/api/v1/memory/",
    {
      method: "POST",
      body: JSON.stringify({
        content,
        category,
        source_conversation_id: null,
      }),
    },
    true
  );
}

export async function updateMemory(memoryId, content, category) {
  return apiRequest(
    `/api/v1/memory/${memoryId}`,
    {
      method: "PUT",
      body: JSON.stringify({
        content,
        category,
      }),
    },
    true
  );
}

export async function deleteMemory(memoryId) {
  return apiRequest(
    `/api/v1/memory/${memoryId}`,
    {
      method: "DELETE",
    },
    true
  );
}

export async function checkDuplicateMemory(content) {
  return apiRequest(
    "/api/v1/memory/check-duplicate",
    {
      method: "POST",
      body: JSON.stringify({ content }),
    },
    true
  );
}

// ==============================
// MEMORY CONSOLIDATION
// ==============================

export async function getConsolidationProposals() {
  return apiRequest(
    "/api/v1/memory/consolidate/proposals",
    {
      method: "POST",
    },
    true
  );
}

export async function applyConsolidationProposal(proposalData) {
  return apiRequest(
    "/api/v1/memory/consolidate/apply",
    {
      method: "POST",
      body: JSON.stringify(proposalData),
    },
    true
  );
}

export async function restoreConsolidatedMemory(consolidatedMemoryId) {
  return apiRequest(
    `/api/v1/memory/consolidate/${consolidatedMemoryId}/restore`,
    {
      method: "POST",
    },
    true
  );
}

// ==============================
// MEMORY RETENTION AND CLEANUP
// ==============================

export async function getMemoryCleanupReview(includeAi = true) {
  return apiRequest(
    `/api/v1/memory/cleanup/review?include_ai=${includeAi}`,
    {},
    true
  );
}

// ==============================
// MEMORY SEARCH, EXPORT & IMPORT
// ==============================

export async function searchMemories(params = {}) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.category && params.category !== "all") query.set("category", params.category);
  if (params.importance && params.importance !== "all") query.set("importance", params.importance);
  if (params.status && params.status !== "all") query.set("status", params.status);
  if (params.sort_by) query.set("sort_by", params.sort_by);
  if (params.sort_order) query.set("sort_order", params.sort_order);
  if (params.page) query.set("page", params.page);
  if (params.page_size) query.set("page_size", params.page_size);

  return apiRequest(
    `/api/v1/memory/search?${query.toString()}`,
    {},
    true
  );
}

export async function exportMemoriesJson() {
  return apiRequest(
    "/api/v1/memory/export/json",
    {},
    true
  );
}

export async function exportMemoriesCsv() {
  const session = getCurrentSession();
  const token = session?.access_token || "";
  const response = await fetch(`${API_BASE_URL}/api/v1/memory/export/csv`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    throw new Error(`CSV export failed with status ${response.status}.`);
  }
  return response.text();
}

export async function previewMemoryImport(format, data) {
  return apiRequest(
    "/api/v1/memory/import/preview",
    {
      method: "POST",
      body: JSON.stringify({ format, data }),
    },
    true
  );
}

export async function confirmMemoryImport(records, skipDuplicates = true) {
  return apiRequest(
    "/api/v1/memory/import/confirm",
    {
      method: "POST",
      body: JSON.stringify({ records, skip_duplicates: skipDuplicates }),
    },
    true
  );
}


// ==============================
// MEMORY SUGGESTIONS
// ==============================

export async function getMemorySuggestion(conversationId) {
  console.log("[EDITH] Requesting memory suggestion:", conversationId);

  const result = await apiRequest(
    `/api/v1/chat/conversations/${conversationId}/memory-suggestion`,
    {
      method: "POST",
    },
    true
  );

  console.log("[EDITH] Memory suggestion response:", result);

  return result;
}
