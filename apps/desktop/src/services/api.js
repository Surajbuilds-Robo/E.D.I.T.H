
const API_BASE_URL = "http://127.0.0.1:8000";

export async function checkBackendHealth() {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/v1/health`
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("E.D.I.T.H backend connection failed:", error);

    return {
      status: "offline",
      application: "E.D.I.T.H"
    };
  }
}
