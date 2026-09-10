const deploymentConfig = {
  appName: 'WA-AutoBot',

  version: '1.0.0',

  deployment: {
    platform: 'Render',
    status: 'ready'
  },

  pairing: {
    enabled: true,
    method: 'phone',
    showPairingCode: true
  },

  features: {
    autoViewStatus: true,
    autoLikeStatus: true,
    antiDelete: true,
    adminProtection: false
  },

  bot: {
    name: 'WA-AutoBot',
    prefix: '.'
  }
};

export default deploymentConfig;
