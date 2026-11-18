
const API_BASE_URL = "http://127.0.0.1:8000";

// ==============================
// COMMON API HELPER
// ==============================

async function apiRequest(endpoint, options = {}, token = null) {
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(
    `${API_BASE_URL}${endpoint}`,
    {
      ...options,
      headers,
    }
  );

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
  return await apiRequest(
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
  return await apiRequest(
    "/api/v1/auth/login",
    {
      method: "POST",
      body: JSON.stringify({
        identifier,
        password,
      }),
    }
  );
}

// ==============================
// CHAT
// ==============================

export async function sendChatMessage(
  message,
  conversationId = null,
  token
) {
  return await apiRequest(
    "/api/v1/chat/",
    {
      method: "POST",
      body: JSON.stringify({
        message,
        conversation_id: conversationId,
      }),
    },
    token
  );
}

// ==============================
// CONVERSATION HISTORY
// ==============================

export async function getConversations(token) {
  return await apiRequest(
    "/api/v1/chat/conversations",
    {},
    token
  );
}

export async function getConversation(conversationId, token) {
  return await apiRequest(
    `/api/v1/chat/conversations/${conversationId}`,
    {},
    token
  );
}

export async function deleteConversation(conversationId, token) {
  return await apiRequest(
    `/api/v1/chat/conversations/${conversationId}`,
    {
      method: "DELETE",
    },
    token
  );
}
