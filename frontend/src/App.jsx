import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  Bot,
  Check,
  ChevronRight,
  Code2,
  Copy,
  Eye,
  Folder,
  HardDrive,
  Heart,
  MessageSquare,
  Pause,
  Play,
  RefreshCw,
  ShieldAlert,
  Sliders,
  Smartphone,
  Terminal,
  Video,
  Music
} from 'lucide-react';

import { api } from './services/api';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const [botStatus, setBotStatus] = useState({
    status: 'Disconnected',
    uptimeSeconds: 0,
    messagesProcessed: 0,
    commandsExecuted: 0,
    mediaSaved: 0,
    activeUsers: 0,
    latency: '0ms'
  });

  const [botConfig, setBotConfig] = useState({
    prefix: '.',
    ownerNumber: '+233554279349',
    botName: 'WA-AutoBot v1.0',
    autoView: true,
    autoLike: true,
    antiDelete: true,
    mediaStorageLimit: '10 GB'
  });

  const [commands, setCommands] = useState([]);
  const [activities, setActivities] = useState([]);
  const [mediaVault, setMediaVault] = useState([]);

  const [chatMessages, setChatMessages] = useState([
    {
      id: 1,
      sender: 'bot',
      text: '🟢 System ready. Waiting for backend connection.',
      time: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      })
    }
  ]);

  const [inputCommand, setInputCommand] = useState('');
  const chatEndRef = useRef(null);

  const fetchAllData = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);

      const [
        statusRes,
        configRes,
        commandsRes,
        activitiesRes,
        mediaRes
      ] = await Promise.all([
        api.getBotStatus(),
        api.getSettings(),
        api.getCommands(),
        api.getActivity(),
        api.getMedia()
      ]);

      if (statusRes?.success && statusRes.data) {
        setBotStatus(statusRes.data);
      }

      if (configRes?.success && configRes.data) {
        setBotConfig(configRes.data);
      }

      if (commandsRes?.success && Array.isArray(commandsRes.data)) {
        setCommands(commandsRes.data);
      }

      if (activitiesRes?.success && Array.isArray(activitiesRes.data)) {
        setActivities(activitiesRes.data);
      }

      if (mediaRes?.success && Array.isArray(mediaRes.data)) {
        setMediaVault(mediaRes.data);
      }

      if (
        !statusRes?.success &&
        !configRes?.success &&
        !commandsRes?.success
      ) {
        setErrorMsg(
          'Backend is not connected. The dashboard is running, but live bot features require the Express backend.'
        );
      }
    } catch (error) {
      console.error(error);
      setErrorMsg(
        'Unable to connect to the backend. Check that the backend server is running.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();

    const interval = setInterval(async () => {
      try {
        const response = await api.getBotStatus();

        if (response?.success && response.data) {
          setBotStatus(response.data);
        }
      } catch {
        // Keep dashboard running if backend is temporarily unavailable.
      }
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({
      behavior: 'smooth'
    });
  }, [chatMessages]);

  const formatUptime = (totalSeconds = 0) => {
    const seconds = Number(totalSeconds) || 0;

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    return `${hours}h ${minutes}m ${secs}s`;
  };

  const handleSendMessage = async (event) => {
    event.preventDefault();

    const userText = inputCommand.trim();

    if (!userText) return;

    const timeStr = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });

    setChatMessages((previous) => [
      ...previous,
      {
        id: Date.now(),
        sender: 'owner',
        text: userText,
        time: timeStr
      }
    ]);

    setInputCommand('');

    try {
      const response = await api.executeCommand({
        command: userText,
        senderNumber: botConfig.ownerNumber
      });

      const responseText = response?.success
        ? response?.data?.response || 'Command completed.'
        : response?.error || 'Command execution failed.';

      setChatMessages((previous) => [
        ...previous,
        {
          id: Date.now() + 1,
          sender: 'bot',
          text: responseText,
          time: timeStr
        }
      ]);

      const [newStatus, newActivities] = await Promise.all([
        api.getBotStatus(),
        api.getActivity()
      ]);

      if (newStatus?.success && newStatus.data) {
        setBotStatus(newStatus.data);
      }

      if (newActivities?.success && Array.isArray(newActivities.data)) {
        setActivities(newActivities.data);
      }
    } catch (error) {
      setChatMessages((previous) => [
        ...previous,
        {
          id: Date.now() + 1,
          sender: 'bot',
          text: `❌ ${error.message || 'Unable to connect to server.'}`,
          time: timeStr
        }
      ]);
    }
  };

  const handleStartBot = async () => {
    try {
      const response = await api.startBot();

      if (response?.success && response.data) {
        setBotStatus(response.data);
        setErrorMsg(null);
      } else {
        setErrorMsg(response?.error || 'Unable to start bot.');
      }
    } catch (error) {
      setErrorMsg(error.message);
    }
  };

  const handleStopBot = async () => {
    try {
      const response = await api.stopBot();

      if (response?.success && response.data) {
        setBotStatus(response.data);
      } else {
        setErrorMsg(response?.error || 'Unable to stop bot.');
      }
    } catch (error) {
      setErrorMsg(error.message);
    }
  };

  const toggleCommandSetting = async (key, value) => {
    const updated = {
      ...botConfig,
      [key]: value
    };

    setBotConfig(updated);

    const response = await api.updateSettings({
      [key]: value
    });

    if (!response?.success) {
      setErrorMsg(response?.error || 'Unable to save setting.');
    }
  };

  const saveConfiguration = async () => {
    const response = await api.updateSettings(botConfig);

    if (response?.success) {
      setErrorMsg(null);
      alert('Configuration saved successfully.');
    } else {
      setErrorMsg(response?.error || 'Unable to save configuration.');
    }
  };

  const CodeProjectTree = () => {
    const [copied, setCopied] = useState(false);

    const projectStructure = `
WA-AutoBot/
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   └── services/
│   │       └── api.js
│   ├── package.json
│   └── vite.config.js
│
├── backend/
│   ├── server.js
│   ├── routes/
│   │   └── api.js
│   ├── middleware/
│   │   └── ownerAuth.js
│   ├── services/
│   │   └── whatsappService.js
│   └── database/
│       └── db.js
│
├── commands/
│   ├── index.js
│   ├── menu.js
│   ├── status.js
│   ├── ping.js
│   ├── settings.js
│   ├── autoview.js
│   ├── autolike.js
│   ├── antidelete.js
│   ├── vv.js
│   ├── song.js
│   ├── video.js
│   └── play.js
│
├── .env.example
├── .gitignore
└── README.md
`;

    const copyBlueprint = async () => {
      try {
        await navigator.clipboard.writeText(projectStructure.trim());
        setCopied(true);

        setTimeout(() => {
          setCopied(false);
        }, 2000);
      } catch {
        setCopied(false);
      }
    };

    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-slate-300 font-mono text-sm">
        <div className="flex justify-between items-center pb-3 mb-3 border-b border-slate-800">
          <span className="text-emerald-400 font-semibold flex items-center gap-2">
            <Code2 className="w-4 h-4" />
            Project Directory
          </span>

          <button
            onClick={copyBlueprint}
            className="flex items-center gap-1 text-xs bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded text-slate-200"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}

            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        <pre className="overflow-x-auto text-xs leading-relaxed">
          {projectStructure}
        </pre>
      </div>
    );
  };

  const navigation = [
    ['dashboard', Activity, 'Dashboard Overview'],
    ['simulator', MessageSquare, 'WhatsApp Console'],
    ['commands', Terminal, 'Commands Manager'],
    ['media', HardDrive, 'Saved Media Vault'],
    ['settings', Sliders, 'Bot Settings'],
    ['architecture', Folder, 'Project Architecture']
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col md:flex-row">
      <aside className="w-full md:w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between p-4">
        <div>
          <div className="flex items-center gap-3 px-2 py-3 mb-6 border-b border-slate-800">
            <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-400 border border-emerald-500/20">
              <Bot className="w-6 h-6" />
            </div>

            <div>
              <h1 className="font-bold text-sm">
                {botConfig.botName}
              </h1>

              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    botStatus.status === 'Connected'
                      ? 'bg-emerald-400 animate-pulse'
                      : 'bg-rose-500'
                  }`}
                />

                <span className="text-xs text-slate-400">
                  {botStatus.status}
                </span>
              </div>
            </div>
          </div>

          <nav className="space-y-1">
            {navigation.map(([tab, Icon, label]) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                  activeTab === tab
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </nav>
        </div>

        <div className="pt-4 border-t border-slate-800">
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex items-center justify-between">
            <div className="text-xs">
              <p className="text-slate-300 font-medium">
                WhatsApp Socket
              </p>

              <p className="text-slate-500">
                {botStatus.status}
              </p>
            </div>

            {botStatus.status === 'Connected' ? (
              <button
                onClick={handleStopBot}
                className="p-2 rounded-lg bg-rose-500/10 text-rose-400"
              >
                <Pause className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleStartBot}
                className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400"
              >
                <Play className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-4 md:p-8">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 mb-6 border-b border-slate-800">
          <div>
            <h2 className="text-2xl font-bold">
              {activeTab === 'dashboard' && 'Control Panel Overview'}
              {activeTab === 'simulator' && 'WhatsApp Console'}
              {activeTab === 'commands' && 'Command Registry'}
              {activeTab === 'media' && 'Media Vault'}
              {activeTab === 'settings' && 'System Configuration'}
              {activeTab === 'architecture' && 'Project Architecture'}
            </h2>

            <p className="text-slate-400 text-sm mt-1">
              WA-AutoBot Control Panel
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={fetchAllData}
              className="p-2 bg-slate-900 text-slate-300 rounded-lg border border-slate-800"
              title="Refresh"
            >
              <RefreshCw
                className={`w-4 h-4 ${
                  loading ? 'animate-spin' : ''
                }`}
              />
            </button>

            <div className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-xs">
              <span className="text-slate-400">
                Prefix:
              </span>{' '}
              <span className="font-mono text-emerald-400">
                {botConfig.prefix}
              </span>
            </div>

            <div className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-xs">
              <span className="text-slate-400">
                Owner:
              </span>{' '}
              <span className="font-mono">
                {botConfig.ownerNumber}
              </span>
            </div>
          </div>
        </header>

        {errorMsg && (
          <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 text-xs flex items-center gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />

            <div>
              <p className="font-semibold">
                {errorMsg}
              </p>
            </div>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                ['Uptime', formatUptime(botStatus.uptimeSeconds), Activity],
                ['Messages Processed', botStatus.messagesProcessed, MessageSquare],
                ['Commands Executed', botStatus.commandsExecuted, Terminal],
                ['Media Saved', botStatus.mediaSaved, HardDrive]
              ].map(([label, value, Icon]) => (
                <div
                  key={label}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between"
                >
                  <div>
                    <p className="text-xs text-slate-400 uppercase">
                      {label}
                    </p>

                    <p className="text-xl font-bold mt-1 font-mono">
                      {value}
                    </p>
                  </div>

                  <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-lg">
                    <Icon className="w-5 h-5" />
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                ['autoView', Eye, 'Auto View Status'],
                ['autoLike', Heart, 'Auto Like Status'],
                ['antiDelete', ShieldAlert, 'Anti-Delete']
              ].map(([key, Icon, title]) => (
                <div
                  key={key}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-5"
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-lg">
                        <Icon className="w-5 h-5" />
                      </div>

                      <div>
                        <h3 className="font-bold text-sm">
                          {title}
                        </h3>

                        <p className="text-xs text-slate-400">
                          {botConfig[key] ? 'Enabled' : 'Disabled'}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() =>
                        toggleCommandSetting(key, !botConfig[key])
                      }
                      className={`w-11 h-6 rounded-full relative ${
                        botConfig[key]
                          ? 'bg-emerald-500'
                          : 'bg-slate-700'
                      }`}
                    >
                      <span
                        className={`absolute top-1 w-4 h-4 rounded-full bg-white ${
                          botConfig[key] ? 'left-6' : 'left-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5">
                <h3 className="font-bold text-sm mb-4 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  Activity Log
                </h3>

                <div className="space-y-3">
                  {activities.length ? (
                    activities.map((activity) => (
                      <div
                        key={activity.id}
                        className="flex items-center justify-between p-3 bg-slate-950/60 rounded-lg border border-slate-800 text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-2 h-2 rounded-full bg-emerald-400" />
                          <span>{activity.text}</span>
                        </div>

                        <span className="text-slate-500">
                          {activity.time}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500 text-center py-4">
                      No activity recorded yet.
                    </p>
                  )}
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <h3 className="font-bold text-sm mb-4 flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-blue-400" />
                  Connection Metrics
                </h3>

                <div className="space-y-3 text-xs">
                  <div className="flex justify-between border-b border-slate-800 py-2">
                    <span className="text-slate-400">Status</span>
                    <span className="text-emerald-400">
                      {botStatus.status}
                    </span>
                  </div>

                  <div className="flex justify-between border-b border-slate-800 py-2">
                    <span className="text-slate-400">Latency</span>
                    <span className="font-mono">
                      {botStatus.latency}
                    </span>
                  </div>

                  <div className="flex justify-between py-2">
                    <span className="text-slate-400">Commands</span>
                    <span>{commands.length}</span>
                  </div>
                </div>

                <button
                  onClick={() => setActiveTab('simulator')}
                  className="w-full mt-5 py-2 bg-emerald-500 text-slate-950 font-semibold rounded-lg text-xs flex items-center justify-center gap-2"
                >
                  Open Console
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'simulator' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl flex flex-col h-[620px]">
              <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm">
                    {botConfig.botName}
                  </h3>

                  <p className="text-xs text-slate-400">
                    Owner: {botConfig.ownerNumber}
                  </p>
                </div>

                <span className="text-xs text-emerald-400">
                  {botStatus.status}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {chatMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex flex-col ${
                      message.sender === 'owner'
                        ? 'items-end'
                        : 'items-start'
                    }`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs whitespace-pre-wrap ${
                        message.sender === 'owner'
                          ? 'bg-emerald-700 rounded-br-none'
                          : 'bg-slate-800 border border-slate-700 rounded-bl-none'
                      }`}
                    >
                      {message.text}
                    </div>

                    <span className="text-[10px] text-slate-500 mt-1">
                      {message.time}
                    </span>
                  </div>
                ))}

                <div ref={chatEndRef} />
              </div>

              <form
                onSubmit={handleSendMessage}
                className="p-3 bg-slate-950 border-t border-slate-800 flex gap-2"
              >
                <input
                  value={inputCommand}
                  onChange={(event) =>
                    setInputCommand(event.target.value)
                  }
                  placeholder={`Type ${botConfig.prefix}menu or ${botConfig.prefix}ping`}
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-500"
                />

                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-500 text-slate-950 font-bold rounded-lg text-xs"
                >
                  Send
                </button>
              </form>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <h3 className="font-bold text-sm mb-3">
                Test Commands
              </h3>

              <div className="space-y-2">
                {[
                  '.menu',
                  '.status',
                  '.ping',
                  '.settings',
                  '.autoview',
                  '.autolike',
                  '.antidelete',
                  '.vv',
                  '.song Calm Down'
                ].map((command) => (
                  <button
                    key={command}
                    onClick={() => setInputCommand(command)}
                    className="w-full text-left px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-emerald-400 font-mono"
                  >
                    {command}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'commands' && (
          <div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-6">
              <h3 className="font-bold text-sm">
                Command Registry
              </h3>

              <p className="text-xs text-slate-400">
                {commands.length} registered commands
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {commands.map((command) => (
                <div
                  key={command.id || command.name}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-mono font-bold">
                      {command.name}
                    </span>

                    <span className="text-[10px] text-emerald-400">
                      Active
                    </span>
                  </div>

                  <p className="text-xs text-slate-400">
                    {command.description}
                  </p>

                  <p className="text-[11px] text-slate-500 mt-3">
                    {command.category}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'media' && (
          <div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-6">
              <h3 className="font-bold text-sm">
                Media Vault
              </h3>

              <p className="text-xs text-slate-400">
                Saved media: {mediaVault.length}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {mediaVault.map((item) => (
                <div
                  key={item.id}
                  className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden"
                >
                  {item.type === 'image' ? (
                    <img
                      src={item.url}
                      alt={item.name}
                      className="w-full h-36 object-cover"
                    />
                  ) : (
                    <div className="h-36 flex items-center justify-center bg-slate-950">
                      {item.type === 'audio' ? (
                        <Music className="w-10 h-10 text-emerald-400" />
                      ) : (
                        <Video className="w-10 h-10 text-blue-400" />
                      )}
                    </div>
                  )}

                  <div className="p-4">
                    <h4 className="font-bold text-xs">
                      {item.name}
                    </h4>

                    <p className="text-[11px] text-slate-400 mt-1">
                      {item.size}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-3xl">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
              <h3 className="font-bold">
                Bot Configuration
              </h3>

              {[
                ['prefix', 'Command Prefix'],
                ['ownerNumber', 'Owner WhatsApp Number'],
                ['botName', 'Bot Name']
              ].map(([key, label]) => (
                <div key={key}>
                  <label className="block text-xs font-semibold mb-1">
                    {label}
                  </label>

                  <input
                    value={botConfig[key]}
                    onChange={(event) =>
                      setBotConfig({
                        ...botConfig,
                        [key]: event.target.value
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>
              ))}

              <button
                onClick={saveConfiguration}
                className="px-5 py-2.5 bg-emerald-500 text-slate-950 font-bold rounded-lg text-xs"
              >
                Save Configuration
              </button>
            </div>
          </div>
        )}

        {activeTab === 'architecture' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <h3 className="font-bold text-sm">
                Full-Stack Architecture
              </h3>

              <p className="text-xs text-slate-400">
                Frontend, backend, commands and configuration.
              </p>
            </div>

            <CodeProjectTree />
          </div>
        )}
      </main>
    </div>
  );
}
