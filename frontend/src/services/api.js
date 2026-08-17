// Frontend API Client
// Connects the React dashboard to the Express backend

const API_BASE_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

async function request(endpoint, options = {}) {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      ...options
    });

    const data = await response.json().catch(() => ({
      success: false,
      error: 'Invalid server response'
    }));

    if (!response.ok) {
      return {
        success: false,
        error: data.error || `Request failed (${response.status})`,
        data: data.data
      };
    }

    return data;
  } catch (error) {
    console.error(`API request failed: ${endpoint}`, error);

    return {
      success: false,
      error: error.message || 'Unable to connect to backend'
    };
  }
}

export const api = {
  // =========================
  // BOT
  // =========================

  getBotStatus: () =>
    request('/bot/status'),

  startBot: () =>
    request('/bot/start', {
      method: 'POST'
    }),

  stopBot: () =>
    request('/bot/stop', {
      method: 'POST'
    }),

  // =========================
  // COMMANDS
  // =========================

  executeCommand: ({ command, senderNumber }) =>
    request('/commands/execute', {
      method: 'POST',
      body: JSON.stringify({
        command,
        senderNumber
      })
    }),

  getCommands: () =>
    request('/commands'),

  // =========================
  // SETTINGS
  // =========================

  getSettings: () =>
    request('/settings'),

  updateSettings: (settings) =>
    request('/settings', {
      method: 'PUT',
      body: JSON.stringify(settings)
    }),

  // =========================
  // MEDIA
  // =========================

  getMedia: () =>
    request('/media'),

  // =========================
  // ACTIVITY
  // =========================

  getActivity: () =>
    request('/activity')
};
