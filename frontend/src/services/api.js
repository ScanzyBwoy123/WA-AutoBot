// Frontend API Client
// Connects the React dashboard to the multi-account Express backend

const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  'http://localhost:3000/api';

async function request(endpoint, options = {}) {
  try {
    const response = await fetch(
      `${API_BASE_URL}${endpoint}`,
      {
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {})
        },
        ...options
      }
    );

    const data =
      await response.json().catch(() => ({
        success: false,
        error: 'Invalid server response'
      }));

    if (!response.ok) {
      return {
        success: false,
        error:
          data.error ||
          data.message ||
          `Request failed (${response.status})`,
        data: data.data
      };
    }

    return data;

  } catch (error) {
    console.error(
      `API request failed: ${endpoint}`,
      error
    );

    return {
      success: false,
      error:
        error.message ||
        'Unable to connect to backend'
    };
  }
}


// The dashboard uses the configured owner account
// for single-account control-panel operations.
function ownerPhone() {
  return String(
    localStorage.getItem('wa_autobot_phone') ||
    ''
  ).replace(/\D/g, '');
}


export const api = {

  // =========================
  // BOT
  // =========================

  getBotStatus: async () => {
    const phone = ownerPhone();

    if (!phone) {
      return {
        success: true,
        data: {
          status: 'Disconnected',
          uptimeSeconds: 0,
          messagesProcessed: 0,
          commandsExecuted: 0,
          mediaSaved: 0,
          activeUsers: 0,
          latency: '0ms'
        }
      };
    }

    const result =
      await request(
        `/account/${encodeURIComponent(phone)}`
      );

    if (
      !result.success ||
      !result.data
    ) {
      return result;
    }

    const account = result.data;

    return {
      success: true,
      data: {
        status:
          account.connected === true
            ? 'Connected'
            : account.connecting === true
              ? 'Connecting'
              : 'Disconnected',

        uptimeSeconds:
          Number(
            account.uptimeSeconds || 0
          ),

        messagesProcessed:
          Number(
            account.messagesProcessed || 0
          ),

        commandsExecuted:
          Number(
            account.commandsExecuted || 0
          ),

        mediaSaved:
          Number(
            account.mediaSaved || 0
          ),

        activeUsers:
          Number(
            account.activeUsers || 0
          ),

        latency:
          account.latency ||
          '0ms'
      }
    };
  },


  startBot: async () => {
    const phone = ownerPhone();

    if (!phone) {
      return {
        success: false,
        error:
          'No WhatsApp account has been paired yet.'
      };
    }

    return request(
      `/accounts/${encodeURIComponent(phone)}/start`,
      {
        method: 'POST'
      }
    );
  },


  stopBot: async () => {
    const phone = ownerPhone();

    if (!phone) {
      return {
        success: false,
        error:
          'No WhatsApp account has been paired yet.'
      };
    }

    return request(
      `/accounts/${encodeURIComponent(phone)}/disconnect`,
      {
        method: 'POST'
      }
    );
  },


  // =========================
  // PAIRING
  // =========================

  registerAccount: ({ phone }) =>
    request('/pair/register', {
      method: 'POST',
      body: JSON.stringify({ phone })
    }),


  getPairingCode: phone =>
    request(
      `/pair/pairing-code/${encodeURIComponent(
        String(phone).replace(/\D/g, '')
      )}`
    ),


  getAccountStatus: phone =>
    request(
      `/pair/status/${encodeURIComponent(
        String(phone).replace(/\D/g, '')
      )}`
    ),


  // =========================
  // COMMANDS
  // =========================

 executeCommand: ({ command, senderNumber }) =>
  request('/commands/execute', {
    method: 'POST',
    body: JSON.stringify({
      command,
      phone: senderNumber
    })
  }), 


  getCommands: () =>
    request('/commands'),


  // =========================
  // SETTINGS
  // =========================

  getSettings: () =>
    request('/settings'),


  updateSettings: settings =>
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
