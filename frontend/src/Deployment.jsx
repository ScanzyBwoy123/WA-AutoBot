import React, { useEffect, useState } from 'react';
import {
  Rocket,
  Smartphone,
  CheckCircle2,
  Copy,
  RefreshCw,
  ShieldCheck,
  Eye,
  Heart,
  Trash2,
  Settings2,
  Wifi,
  Server,
  Zap,
  Terminal,
  ArrowRight,
  Lock,
  Sparkles,
  CircleCheck,
  Loader2,
} from 'lucide-react';
const API_BASE =
  import.meta.env.VITE_API_URL ||
  'https://wa-autobot.onrender.com/api';
async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      `Invalid server response (${response.status})`
    );
  }
  if (!response.ok) {
    throw new Error(
      data?.message ||
      data?.error ||
      `Request failed (${response.status})`
    );
  }
  return data;
}
function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}
function formatPhone(phone) {
  const clean = normalizePhone(phone);
  if (!clean) return '';
  if (clean.startsWith('233') && clean.length >= 12) {
    return `+${clean}`;
  }
  return `+${clean}`;
}
export default function Deployment() {
  const [phone, setPhone] = useState(
    () =>
      localStorage.getItem('wa_autobot_phone') ||
      ''
  );
  const [pairingCode, setPairingCode] = useState('');
  const [registered, setRegistered] = useState(false);
  const [connected, setConnected] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [loadingCode, setLoadingCode] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [botName, setBotName] = useState('WA-AutoBot');
  const [prefix, setPrefix] = useState('.');
  const [reaction, setReaction] = useState('❤️');
  const [features, setFeatures] = useState({
    autoView: true,
    autoLike: true,
    antiDelete: true,
    adminProtection: false,
  });
  useEffect(() => {
    const savedPhone =
      localStorage.getItem('wa_autobot_phone');
    if (savedPhone) {
      setPhone(savedPhone);
      setRegistered(true);
      checkConnection(savedPhone);
    }
  }, []);
  async function registerPhone() {
    const normalized = normalizePhone(phone);
    if (!normalized) {
      setError('Please enter your WhatsApp phone number.');
      return;
    }
    setError('');
    setMessage('Registering your WhatsApp account...');
    setLoadingCode(true);
    try {
      const result = await apiRequest(
        `${API_BASE}/pair/register`,
        {
          method: 'POST',
          body: JSON.stringify({
            phone: normalized,
          }),
        }
      );
      if (!result?.success) {
        throw new Error(
          result?.message ||
          'Unable to register the account.'
        );
      }
      localStorage.setItem(
        'wa_autobot_phone',
        normalized
      );
      setPhone(normalized);
      setRegistered(true);
      setConnected(false);
      setMessage(
        'Account registered. Preparing your pairing code...'
      );
      await requestPairingCode(normalized);
    } catch (err) {
      setError(
        err?.message ||
        'Unable to register your WhatsApp account.'
      );
      setMessage('');
      setLoadingCode(false);
    }
  }
  async function requestPairingCode(currentPhone = phone) {
    const normalized = normalizePhone(currentPhone);
    if (!normalized) return;
    setError('');
    setMessage('Requesting WhatsApp pairing code...');
    setLoadingCode(true);
    try {
      const result = await apiRequest(
        `${API_BASE}/pairing-code/${normalized}`
      );
      const code =
        result?.data?.pairingCode ||
        result?.pairingCode ||
        '';
      if (code) {
        setPairingCode(code);
        setMessage(
          'Pairing code ready. Open WhatsApp and link this device.'
        );
        setLoadingCode(false);
        return;
      }
      setPairingCode('');
      setMessage(
        'Waiting for WhatsApp pairing code...'
      );
      setTimeout(() => {
        requestPairingCode(normalized);
      }, 2500);
    } catch (err) {
      setError(
        err?.message ||
        'Unable to get pairing code.'
      );
      setMessage('');
      setLoadingCode(false);
    }
  }
  async function checkConnection(currentPhone = phone) {
    const normalized = normalizePhone(currentPhone);
    if (!normalized) return;
    setCheckingStatus(true);
    try {
      const result = await apiRequest(
        `${API_BASE}/pair/status/${normalized}`
      );
      const whatsapp =
        result?.data?.whatsapp ||
        result?.whatsapp ||
        {};
      const account =
        result?.data?.account ||
        result?.account ||
        {};
      const isConnected =
        whatsapp?.connected === true ||
        whatsapp?.status === 'connected' ||
        account?.connected === true;
      setConnected(isConnected);
      if (isConnected) {
        setMessage(
          'WhatsApp is connected to WA-AutoBot.'
        );
      }
    } catch {
      // Keep the deployment page usable even if
      // the status endpoint is temporarily unavailable.
    } finally {
      setCheckingStatus(false);
    }
  }
  async function deployBot() {
    const normalized = normalizePhone(phone);
    if (!normalized) {
      setError(
        'Connect a WhatsApp number before deploying the bot.'
      );
      return;
    }
    setError('');
    setMessage('Starting WA-AutoBot on the server...');
    setDeploying(true);
    try {
      const result = await apiRequest(
        `${API_BASE}/accounts/${normalized}/start`,
        {
          method: 'POST',
        }
      );
      if (!result?.success) {
        throw new Error(
          result?.message ||
          'Unable to start WA-AutoBot.'
        );
      }
      setMessage(
        'WA-AutoBot deployment started successfully.'
      );
      setTimeout(() => {
        checkConnection(normalized);
      }, 1500);
    } catch (err) {
      setError(
        err?.message ||
        'Unable to deploy WA-AutoBot.'
      );
      setMessage('');
    } finally {
      setDeploying(false);
    }
  }
  function copyPairingCode() {
    if (!pairingCode) return;
    navigator.clipboard
      ?.writeText(pairingCode)
      .then(() => {
        setMessage('Pairing code copied.');
      })
      .catch(() => {
        setError(
          'Unable to copy automatically. Please copy the code manually.'
        );
      });
  }
  function toggleFeature(name) {
    setFeatures(current => ({
      ...current,
      [name]: !current[name],
    }));
  }
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050816] text-white">
      {/* =====================================================
          PREMIUM BACKGROUND
      ====================================================== */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* Main gradient */}
        <div
          className="
            absolute inset-0
            bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.30),_transparent_38%),
                radial-gradient(circle_at_top_right,_rgba(124,58,237,0.32),_transparent_38%),
                radial-gradient(circle_at_bottom_left,_rgba(6,182,212,0.18),_transparent_35%),
                linear-gradient(135deg,#020617_0%,#07112e_45%,#100827_100%)]
          "
        />
        {/* Blue glow */}
        <div
          className="
            absolute -left-32 top-24
            h-96 w-96
            rounded-full
            bg-blue-600/20
            blur-[110px]
          "
        />
        {/* Purple glow */}
        <div
          className="
            absolute -right-32 top-10
            h-[28rem] w-[28rem]
            rounded-full
            bg-purple-600/25
            blur-[120px]
          "
        />
        {/* Cyan glow */}
        <div
          className="
            absolute bottom-[-120px] left-[30%]
            h-96 w-96
            rounded-full
            bg-cyan-500/10
            blur-[120px]
          "
        />
        {/* Grid */}
        <div
          className="
            absolute inset-0 opacity-[0.13]
            bg-[linear-gradient(rgba(96,165,250,0.35)_1px,transparent_1px),
                linear-gradient(90deg,rgba(96,165,250,0.35)_1px,transparent_1px)]
            bg-[size:42px_42px]
          "
        />
        {/* Decorative circles */}
        <div
          className="
            absolute left-[8%] top-[18%]
            h-32 w-32
            rounded-full
            border border-blue-400/20
            shadow-[0_0_60px_rgba(59,130,246,0.18)]
          "
        />
        <div
          className="
            absolute right-[8%] top-[40%]
            h-44 w-44
            rounded-full
            border border-purple-400/20
            shadow-[0_0_80px_rgba(139,92,246,0.18)]
          "
        />
        <div
          className="
            absolute bottom-[8%] left-[12%]
            h-20 w-20
            rounded-full
            border border-cyan-300/20
          "
        />
      </div>
      {/* =====================================================
          CONTENT
      ====================================================== */}
      <div className="relative z-10 mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.06] p-6 shadow-2xl backdrop-blur-2xl">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div
                className="
                  flex h-16 w-16 items-center justify-center
                  rounded-2xl
                  bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600
                  shadow-[0_0_35px_rgba(99,102,241,0.45)]
                "
              >
                <Rocket size={30} />
              </div>
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <Sparkles
                    size={16}
                    className="text-cyan-300"
                  />
                  <span className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300">
                    Premium Deployment
                  </span>
                </div>
                <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                  WA-AutoBot
                </h1>
                <p className="mt-1 text-sm text-slate-300">
                  Configure, connect and deploy your WhatsApp bot.
                </p>
              </div>
            </div>
            <div
              className={`
                inline-flex items-center gap-2 self-start rounded-full border px-4 py-2 text-sm font-semibold md:self-auto
                ${
                  connected
                    ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                    : 'border-yellow-400/30 bg-yellow-400/10 text-yellow-300'
                }
              `}
            >
              <span
                className={`
                  h-2.5 w-2.5 rounded-full
                  ${
                    connected
                      ? 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]'
                      : 'bg-yellow-400 shadow-[0_0_12px_rgba(250,204,21,0.8)]'
                  }
                `}
              />
              {connected
                ? 'WhatsApp Connected'
                : 'Waiting for Connection'}
            </div>
          </div>
        </div>
        {/* Status messages */}
        {(message || error) && (
          <div
            className={`
              mb-6 rounded-2xl border p-4 backdrop-blur-xl
              ${
                error
                  ? 'border-red-400/30 bg-red-500/10 text-red-200'
                  : 'border-blue-400/30 bg-blue-500/10 text-blue-100'
              }
            `}
          >
            <div className="flex items-start gap-3">
              {error ? (
                <Zap
                  size={20}
                  className="mt-0.5 text-red-300"
                />
              ) : (
                <CircleCheck
                  size={20}
                  className="mt-0.5 text-blue-300"
                />
              )}
              <span className="text-sm leading-6">
                {error || message}
              </span>
            </div>
          </div>
        )}
        {/* =====================================================
            SETUP STEPS
        ====================================================== */}
        <div className="mb-8 grid gap-4 md:grid-cols-3">
          <StepCard
            number="01"
            icon={<Settings2 size={21} />}
            title="Configure"
            text="Choose how WA-AutoBot should behave."
            active
          />
          <StepCard
            number="02"
            icon={<Smartphone size={21} />}
            title="Connect WhatsApp"
            text="Pair your WhatsApp account securely."
            active={registered}
          />
          <StepCard
            number="03"
            icon={<Rocket size={21} />}
            title="Deploy"
            text="Start your bot on the Render server."
            active={connected}
          />
        </div>
        {/* =====================================================
            MAIN GRID
        ====================================================== */}
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          {/* LEFT */}
          <div className="space-y-6">
            {/* Configuration */}
            <Panel
              icon={<Settings2 size={20} />}
              title="Bot Configuration"
              subtitle="Customize your bot before deployment."
            >
              <div className="grid gap-5 sm:grid-cols-2">
                <InputField
                  label="Bot Name"
                  value={botName}
                  onChange={setBotName}
                  placeholder="WA-AutoBot"
                />
                <InputField
                  label="Command Prefix"
                  value={prefix}
                  onChange={setPrefix}
                  placeholder="."
                />
              </div>
              <div className="mt-5">
                <label className="mb-2 block text-sm font-semibold text-slate-200">
                  Status Reaction
                </label>
                <select
                  value={reaction}
                  onChange={e =>
                    setReaction(e.target.value)
                  }
                  className="
                    w-full rounded-xl
                    border border-white/10
                    bg-[#0b1228]
                    px-4 py-3
                    text-white outline-none
                    transition
                    focus:border-blue-400/50
                    focus:ring-2
                    focus:ring-blue-500/20
                  "
                >
                  <option value="❤️">❤️ Heart</option>
                  <option value="👍">👍 Like</option>
                  <option value="🔥">🔥 Fire</option>
                  <option value="😂">😂 Laugh</option>
                  <option value="😍">😍 Love</option>
                  <option value="👏">👏 Clap</option>
                </select>
              </div>
            </Panel>
            {/* Features */}
            <Panel
              icon={<Zap size={20} />}
              title="Automation Features"
              subtitle="Turn individual bot capabilities on or off."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <FeatureCard
                  icon={<Eye size={21} />}
                  title="Auto View"
                  description="Automatically view WhatsApp statuses."
                  enabled={features.autoView}
                  onClick={() =>
                    toggleFeature('autoView')
                  }
                  glow="blue"
                />
                <FeatureCard
                  icon={<Heart size={21} />}
                  title="Auto Like"
                  description="Automatically react to statuses."
                  enabled={features.autoLike}
                  onClick={() =>
                    toggleFeature('autoLike')
                  }
                  glow="pink"
                />
                <FeatureCard
                  icon={<Trash2 size={21} />}
                  title="Anti-Delete"
                  description="Keep track of deleted messages."
                  enabled={features.antiDelete}
                  onClick={() =>
                    toggleFeature('antiDelete')
                  }
                  glow="purple"
                />
                <FeatureCard
                  icon={<ShieldCheck size={21} />}
                  title="Admin Protection"
                  description="Protect the administrator from abuse."
                  enabled={features.adminProtection}
                  onClick={() =>
                    toggleFeature('adminProtection')
                  }
                  glow="cyan"
                />
              </div>
            </Panel>
            {/* Deployment */}
            <Panel
              icon={<Rocket size={20} />}
              title="Deployment"
              subtitle="Launch WA-AutoBot on the connected account."
            >
              <div className="rounded-2xl border border-blue-400/20 bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 p-5">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="mb-1 flex items-center gap-2">
                      <Server
                        size={17}
                        className="text-blue-300"
                      />
                      <span className="font-bold">
                        Render Server
                      </span>
                    </div>
                    <p className="text-sm text-slate-400">
                      Your bot will run on the connected backend.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={deployBot}
                    disabled={
                      deploying ||
                      !registered
                    }
                    className="
                      inline-flex items-center justify-center gap-2
                      rounded-xl
                      bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600
                      px-6 py-3
                      font-bold
                      shadow-[0_0_25px_rgba(79,70,229,0.35)]
                      transition
                      hover:-translate-y-0.5
                      hover:shadow-[0_0_35px_rgba(99,102,241,0.5)]
                      disabled:cursor-not-allowed
                      disabled:opacity-50
                    "
                  >
                    {deploying ? (
                      <>
                        <Loader2
                          size={18}
                          className="animate-spin"
                        />
                        Deploying...
                      </>
                    ) : (
                      <>
                        <Rocket size={18} />
                        Deploy Bot
                        <ArrowRight size={17} />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </Panel>
          </div>
          {/* RIGHT */}
          <div className="space-y-6">
            {/* WhatsApp Connection */}
            <Panel
              icon={<Smartphone size={20} />}
              title="WhatsApp Connection"
              subtitle="Connect the WhatsApp account that will run the bot."
            >
              <label className="mb-2 block text-sm font-semibold text-slate-200">
                WhatsApp Phone Number
              </label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  value={phone}
                  onChange={e =>
                    setPhone(e.target.value)
                  }
                  placeholder="233554279349"
                  inputMode="numeric"
                  className="
                    min-w-0 flex-1 rounded-xl
                    border border-white/10
                    bg-[#080d20]
                    px-4 py-3
                    text-white
                    outline-none
                    placeholder:text-slate-600
                    focus:border-blue-400/50
                    focus:ring-2
                    focus:ring-blue-500/20
                  "
                />
                <button
                  type="button"
                  onClick={registerPhone}
                  disabled={loadingCode}
                  className="
                    inline-flex items-center justify-center gap-2
                    rounded-xl
                    border border-blue-400/30
                    bg-blue-500/15
                    px-5 py-3
                    font-semibold text-blue-200
                    transition
                    hover:bg-blue-500/25
                    disabled:opacity-50
                  "
                >
                  {loadingCode ? (
                    <Loader2
                      size={18}
                      className="animate-spin"
                    />
                  ) : (
                    <Wifi size={18} />
                  )}
                  Connect
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Enter the number with country code, without spaces.
              </p>
              {/* Account status */}
              <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">
                    Account
                  </span>
                  <span className="font-semibold text-white">
                    {formatPhone(phone) || 'Not configured'}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm text-slate-400">
                    Status
                  </span>
                  <span
                    className={`
                      inline-flex items-center gap-2 text-sm font-semibold
                      ${
                        connected
                          ? 'text-emerald-300'
                          : 'text-yellow-300'
                      }
                    `}
                  >
                    <span
                      className={`
                        h-2 w-2 rounded-full
                        ${
                          connected
                            ? 'bg-emerald-400'
                            : 'bg-yellow-400'
                        }
                      `}
                    />
                    {checkingStatus
                      ? 'Checking...'
                      : connected
                        ? 'Connected'
                        : 'Not connected'}
                  </span>
                </div>
              </div>
            </Panel>
            {/* Pairing Code */}
            <div
              className="
                overflow-hidden rounded-3xl
                border border-purple-400/20
                bg-gradient-to-br
                from-purple-500/15
                via-indigo-500/10
                to-blue-500/10
                p-6
                shadow-[0_0_50px_rgba(124,58,237,0.10)]
                backdrop-blur-2xl
              "
            >
              <div className="mb-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="
                      flex h-11 w-11 items-center justify-center
                      rounded-xl
                      bg-purple-500/15
                      text-purple-300
                    "
                  >
                    <Lock size={20} />
                  </div>
                  <div>
                    <h2 className="font-bold">
                      Pairing Code
                    </h2>
                    <p className="text-xs text-slate-400">
                      Secure WhatsApp linking
                    </p>
                  </div>
                </div>
                {pairingCode && (
                  <button
                    type="button"
                    onClick={copyPairingCode}
                    className="
                      rounded-lg
                      border border-white/10
                      bg-white/5
                      p-2
                      text-slate-300
                      transition
                      hover:bg-white/10
                      hover:text-white
                    "
                    title="Copy pairing code"
                  >
                    <Copy size={17} />
                  </button>
                )}
              </div>
              <div
                className="
                  flex min-h-[110px]
                  items-center justify-center
                  rounded-2xl
                  border border-purple-400/20
                  bg-[#050816]/70
                  p-5
                "
              >
                {loadingCode ? (
                  <div className="flex flex-col items-center gap-3 text-slate-400">
                    <Loader2
                      size={28}
                      className="animate-spin text-purple-400"
                    />
                    <span className="text-sm">
                      Generating pairing code...
                    </span>
                  </div>
                ) : pairingCode ? (
                  <div className="text-center">
                    <div
                      className="
                        font-mono
                        text-3xl
                        font-black
                        tracking-[0.35em]
                        text-white
                        drop-shadow-[0_0_15px_rgba(168,85,247,0.55)]
                      "
                    >
                      {pairingCode}
                    </div>
                    <p className="mt-3 text-xs text-slate-400">
                      Enter this code inside WhatsApp → Linked Devices.
                    </p>
                  </div>
                ) : (
                  <div className="text-center text-slate-500">
                    <Smartphone
                      size={30}
                      className="mx-auto mb-2 opacity-50"
                    />
                    <p className="text-sm">
                      Your pairing code will appear here.
                    </p>
                  </div>
                )}
              </div>
              {pairingCode && (
                <div className="mt-5 space-y-3">
                  <Instruction
                    number="1"
                    text="Open WhatsApp on your phone."
                  />
                  <Instruction
                    number="2"
                    text="Go to Settings → Linked Devices."
                  />
                  <Instruction
                    number="3"
                    text="Choose Link a Device and enter the pairing code."
                  />
                </div>
              )}
            </div>
            {/* System information */}
            <Panel
              icon={<Terminal size={20} />}
              title="System Information"
              subtitle="Current deployment environment."
            >
              <InfoRow
                icon={<Server size={17} />}
                label="Platform"
                value="Render"
              />
              <InfoRow
                icon={<Zap size={17} />}
                label="Backend"
                value="Express + WhatsApp"
              />
              <InfoRow
                icon={<Wifi size={17} />}
                label="Connection"
                value={
                  connected
                    ? 'Online'
                    : 'Waiting'
                }
              />
              <InfoRow
                icon={<ShieldCheck size={17} />}
                label="Security"
                value="Protected"
              />
            </Panel>
          </div>
        </div>
        {/* Footer */}
        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-center backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-slate-400">
            <CheckCircle2
              size={17}
              className="text-emerald-400"
            />
            <span>
              WA-AutoBot deployment environment
            </span>
            <span className="text-slate-600">
              •
            </span>
            <span>
              Version 1.0.0
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
/* ============================================================
   COMPONENTS
============================================================ */
function Panel({
  icon,
  title,
  subtitle,
  children,
}) {
  return (
    <section
      className="
        rounded-3xl
        border border-white/10
        bg-white/[0.055]
        p-6
        shadow-2xl
        backdrop-blur-2xl
      "
    >
      <div className="mb-6 flex items-start gap-3">
        <div
          className="
            flex h-10 w-10 shrink-0
            items-center justify-center
            rounded-xl
            border border-white/10
            bg-gradient-to-br
            from-blue-500/20
            to-purple-500/20
            text-blue-200
          "
        >
          {icon}
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">
            {title}
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            {subtitle}
          </p>
        </div>
      </div>
      {children}
    </section>
  );
}
function StepCard({
  number,
  icon,
  title,
  text,
  active,
}) {
  return (
    <div
      className={`
        relative overflow-hidden
        rounded-2xl
        border
        p-5
        backdrop-blur-xl
        transition
        ${
          active
            ? 'border-blue-400/25 bg-blue-500/[0.09] shadow-[0_0_30px_rgba(59,130,246,0.08)]'
            : 'border-white/10 bg-white/[0.04]'
        }
      `}
    >
      <div className="absolute right-4 top-3 text-5xl font-black text-white/[0.035]">
        {number}
      </div>
      <div className="relative flex items-center gap-3">
        <div
          className={`
            flex h-11 w-11 items-center justify-center
            rounded-xl
            ${
              active
                ? 'bg-blue-500/15 text-blue-300'
                : 'bg-white/5 text-slate-400'
            }
          `}
        >
          {icon}
        </div>
        <div>
          <h3 className="font-bold">
            {title}
          </h3>
          <p className="mt-1 text-xs text-slate-400">
            {text}
          </p>
        </div>
      </div>
    </div>
  );
}
function InputField({
  label,
  value,
  onChange,
  placeholder,
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-slate-200">
        {label}
      </label>
      <input
        value={value}
        onChange={e =>
          onChange(e.target.value)
        }
        placeholder={placeholder}
        className="
          w-full rounded-xl
          border border-white/10
          bg-[#080d20]
          px-4 py-3
          text-white
          outline-none
          placeholder:text-slate-600
          focus:border-blue-400/50
          focus:ring-2
          focus:ring-blue-500/20
        "
      />
    </div>
  );
}
function FeatureCard({
  icon,
  title,
  description,
  enabled,
  onClick,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        w-full
        rounded-2xl
        border
        p-4
        text-left
        transition
        ${
          enabled
            ? 'border-blue-400/25 bg-blue-500/[0.09] shadow-[0_0_25px_rgba(59,130,246,0.08)]'
            : 'border-white/10 bg-white/[0.025]'
        }
        hover:-translate-y-0.5
        hover:border-blue-300/30
      `}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={`
            flex h-10 w-10 shrink-0 items-center justify-center
            rounded-xl
            ${
              enabled
                ? 'bg-blue-500/15 text-blue-300'
                : 'bg-white/5 text-slate-500'
            }
          `}
        >
          {icon}
        </div>
        <div
          className={`
            flex h-6 w-11 items-center rounded-full p-1 transition
            ${
              enabled
                ? 'bg-blue-500'
                : 'bg-slate-700'
            }
          `}
        >
          <span
            className={`
              h-4 w-4 rounded-full bg-white shadow transition
              ${
                enabled
                  ? 'translate-x-5'
                  : 'translate-x-0'
              }
            `}
          />
        </div>
      </div>
      <div className="mt-4">
        <h3 className="font-bold">
          {title}
        </h3>
        <p className="mt-1 text-xs leading-5 text-slate-400">
          {description}
        </p>
      </div>
    </button>
  );
}
function Instruction({
  number,
  text,
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="
          flex h-7 w-7 shrink-0
          items-center justify-center
          rounded-full
          bg-purple-500/15
          text-xs font-bold
          text-purple-300
        "
      >
        {number}
      </div>
      <p className="text-sm text-slate-300">
        {text}
      </p>
    </div>
  );
}
function InfoRow({
  icon,
  label,
  value,
}) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 py-3 last:border-b-0">
      <div className="flex items-center gap-3 text-slate-400">
        {icon}
        <span className="text-sm">
          {label}
        </span>
      </div>
      <span className="text-sm font-semibold text-white">
        {value}
      </span>
    </div>
  );
}
