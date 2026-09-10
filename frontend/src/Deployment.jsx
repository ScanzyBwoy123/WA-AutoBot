import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  Cloud,
  Copy,
  ExternalLink,
  Eye,
  Heart,
  Link2,
  Loader2,
  Lock,
  MessageCircle,
  Phone,
  Rocket,
  ShieldCheck,
  Sparkles,
  Smartphone,
  Zap,
} from 'lucide-react';
const API_BASE =
  import.meta.env.VITE_API_URL ||
  'https://wa-autobot.onrender.com/api';
const DEFAULT_REACTION = '❤️';
function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}
function formatPhone(value) {
  const clean = normalizePhone(value);
  if (!clean) return '';
  if (clean.startsWith('233') && clean.length === 12) {
    return `+${clean}`;
  }
  return `+${clean}`;
}
async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      `Server returned an invalid response (${response.status}).`
    );
  }
  if (!response.ok || data?.success === false) {
    throw new Error(
      data?.message ||
        data?.error ||
        `Request failed with status ${response.status}.`
    );
  }
  return data;
}
export default function Deployment() {
  const savedPhone =
    typeof window !== 'undefined'
      ? localStorage.getItem('wa_autobot_phone') || ''
      : '';
  const [phone, setPhone] = useState(savedPhone);
  const [pairingCode, setPairingCode] = useState('');
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [connected, setConnected] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [features, setFeatures] = useState({
    autoView: true,
    autoLike: true,
    antiDelete: true,
  });
  const cleanPhone = useMemo(
    () => normalizePhone(phone),
    [phone]
  );
  const displayPhone = useMemo(
    () => formatPhone(cleanPhone),
    [cleanPhone]
  );
  useEffect(() => {
    if (!cleanPhone) return;
    let cancelled = false;
    let timer = null;
    const checkStatus = async () => {
      try {
        const result = await apiRequest(
          `${API_BASE}/pair/status/${cleanPhone}`
        );
        if (cancelled) return;
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
        if (isConnected) {
          setConnected(true);
          setStatus('connected');
          setMessage('WhatsApp is connected to WA-AutoBot.');
        }
      } catch {
        // Do not show a noisy error during background polling.
      }
      if (!cancelled && !connected) {
        timer = setTimeout(checkStatus, 5000);
      }
    };
    checkStatus();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [cleanPhone, connected]);
  const startPairing = async () => {
    if (!cleanPhone) {
      setStatus('error');
      setMessage('Enter your WhatsApp phone number first.');
      return;
    }
    if (cleanPhone.length < 10) {
      setStatus('error');
      setMessage('Enter a valid WhatsApp phone number.');
      return;
    }
    setStatus('loading');
    setMessage('Connecting to WA-AutoBot...');
    setPairingCode('');
    setConnected(false);
    try {
      const result = await apiRequest(
        `${API_BASE}/pair/register`,
        {
          method: 'POST',
          body: JSON.stringify({
            phone: cleanPhone,
          }),
        }
      );
      localStorage.setItem(
        'wa_autobot_phone',
        cleanPhone
      );
      setMessage(
        result?.message ||
          'Pairing session created. Getting your pairing code...'
      );
      await pollPairingCode(cleanPhone);
    } catch (error) {
      setStatus('error');
      setMessage(
        error?.message ||
          'Unable to connect to the WA-AutoBot server.'
      );
    }
  };
  const pollPairingCode = async number => {
    let attempts = 0;
    const maxAttempts = 24;
    setStatus('loading');
    const poll = async () => {
      attempts += 1;
      try {
        const result = await apiRequest(
          `${API_BASE}/pair/pairing-code/${number}`
        );
        const data = result?.data || {};
        const code = String(
          data?.pairingCode || ''
        ).trim();
        if (code) {
          setPairingCode(code);
          setStatus('code');
          setMessage(
            'Your pairing code is ready. Open WhatsApp and link this device.'
          );
          return;
        }
        if (attempts >= maxAttempts) {
          setStatus('error');
          setMessage(
            'The pairing code took too long to become available. Please try again.'
          );
          return;
        }
      } catch (error) {
        if (attempts >= maxAttempts) {
          setStatus('error');
          setMessage(
            error?.message ||
              'Unable to load the pairing code.'
          );
          return;
        }
      }
      setTimeout(poll, 2500);
    };
    poll();
  };
  const deployBot = async () => {
    if (!cleanPhone) {
      setStatus('error');
      setMessage(
        'Enter and pair your WhatsApp number before deploying.'
      );
      return;
    }
    setDeploying(true);
    setMessage('Starting your WA-AutoBot account...');
    try {
      await apiRequest(
        `${API_BASE}/accounts/${cleanPhone}/start`,
        {
          method: 'POST',
        }
      );
      setStatus('loading');
      setMessage(
        'WA-AutoBot is starting. Waiting for WhatsApp connection...'
      );
      await pollConnection(cleanPhone);
    } catch (error) {
      setDeploying(false);
      setStatus('error');
      setMessage(
        error?.message ||
          'Unable to start the bot.'
      );
    }
  };
  const pollConnection = async number => {
    let attempts = 0;
    const maxAttempts = 30;
    const poll = async () => {
      attempts += 1;
      try {
        const result = await apiRequest(
          `${API_BASE}/pair/status/${number}`
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
        if (isConnected) {
          setConnected(true);
          setDeploying(false);
          setStatus('connected');
          setMessage(
            'Connected! WA-AutoBot is now online.'
          );
          return;
        }
        if (attempts >= maxAttempts) {
          setDeploying(false);
          setStatus('code');
          setMessage(
            'The bot is ready. Finish linking the device in WhatsApp.'
          );
          return;
        }
      } catch {
        if (attempts >= maxAttempts) {
          setDeploying(false);
          setStatus('code');
          setMessage(
            'Finish linking the device in WhatsApp, then check the connection.'
          );
          return;
        }
      }
      setTimeout(poll, 3000);
    };
    poll();
  };
  const copyPairingCode = async () => {
    if (!pairingCode) return;
    try {
      await navigator.clipboard.writeText(pairingCode);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 1800);
    } catch {
      setMessage(
        'Copy is not available on this device. Long-press the code instead.'
      );
    }
  };
  const resetPairing = () => {
    setPairingCode('');
    setConnected(false);
    setStatus('idle');
    setMessage('');
    setDeploying(false);
  };
  const toggleFeature = key => {
    setFeatures(previous => ({
      ...previous,
      [key]: !previous[key],
    }));
  };
  const steps = [
    {
      number: 1,
      title: 'Enter WhatsApp',
      description: 'Use the number you want to connect.',
      complete: Boolean(cleanPhone),
    },
    {
      number: 2,
      title: 'Get pairing code',
      description: 'Generate your secure WhatsApp linking code.',
      complete: Boolean(pairingCode),
    },
    {
      number: 3,
      title: 'Link device',
      description: 'Enter the code inside WhatsApp Linked Devices.',
      complete: connected,
    },
    {
      number: 4,
      title: 'Go online',
      description: 'WA-AutoBot starts your configured bot.',
      complete: connected,
    },
  ];
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      {/* Premium background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="absolute right-0 top-20 h-[32rem] w-[32rem] rounded-full bg-violet-600/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)',
            backgroundSize: '42px 42px',
          }}
        />
      </div>
      <div className="relative z-10 mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 shadow-2xl shadow-blue-500/30">
              <MessageCircle size={28} />
              <Sparkles
                size={15}
                className="absolute -right-1 -top-1 text-cyan-200"
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.25em] text-blue-300">
                WA-AutoBot
              </p>
              <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
                Bot Deployment Center
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                Connect WhatsApp, configure your bot and bring it online.
              </p>
            </div>
          </div>
          <div className="flex w-fit items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-300">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            48-hour free trial
          </div>
        </div>
        {/* Main grid */}
        <div className="grid gap-6 xl:grid-cols-[1.5fr_0.8fr]">
          {/* Left */}
          <div className="space-y-6">
            {/* Hero card */}
            <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.06] p-6 shadow-2xl backdrop-blur-xl sm:p-8">
              <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-blue-500/20 blur-3xl" />
              <div className="relative">
                <div className="mb-6 flex items-start justify-between gap-4">
                  <div>
                    <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-1.5 text-xs font-semibold text-blue-300">
                      <Rocket size={14} />
                      One-click deployment
                    </div>
                    <h2 className="text-2xl font-bold sm:text-3xl">
                      Connect your WhatsApp
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                      Enter your WhatsApp number to generate a real pairing
                      code and connect this device to WA-AutoBot.
                    </p>
                  </div>
                  <div className="hidden rounded-2xl border border-white/10 bg-white/5 p-3 sm:block">
                    <Smartphone
                      size={26}
                      className="text-blue-300"
                    />
                  </div>
                </div>
                {/* Phone input */}
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    WhatsApp phone number
                  </label>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <div className="flex flex-1 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3">
                      <Phone
                        size={19}
                        className="shrink-0 text-blue-300"
                      />
                      <input
                        value={phone}
                        onChange={event => {
                          setPhone(event.target.value);
                          resetPairing();
                        }}
                        placeholder="233554279349"
                        inputMode="numeric"
                        disabled={status === 'loading' || deploying}
                        className="w-full bg-transparent text-base font-semibold text-white outline-none placeholder:text-slate-600"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={startPairing}
                      disabled={
                        status === 'loading' ||
                        deploying ||
                        !cleanPhone
                      }
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-violet-600 px-6 py-3 font-bold shadow-lg shadow-blue-500/20 transition hover:scale-[1.01] hover:from-blue-400 hover:to-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {status === 'loading' ? (
                        <>
                          <Loader2
                            size={18}
                            className="animate-spin"
                          />
                          Connecting...
                        </>
                      ) : (
                        <>
                          <Link2 size={18} />
                          Get Pairing Code
                        </>
                      )}
                    </button>
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                    <Lock size={13} />
                    Your number is used only for this bot connection.
                  </div>
                </div>
                {/* Status message */}
                {message && (
                  <div
                    className={`mt-4 rounded-2xl border p-4 text-sm ${
                      status === 'error'
                        ? 'border-red-400/20 bg-red-400/10 text-red-200'
                        : status === 'connected'
                        ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
                        : 'border-blue-400/20 bg-blue-400/10 text-blue-200'
                    }`}
                  >
                    {message}
                  </div>
                )}
                {/* Pairing code */}
                {pairingCode && (
                  <div className="mt-5 overflow-hidden rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-400/[0.08] to-blue-500/[0.08] p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">
                          Your WhatsApp pairing code
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Enter this code in WhatsApp → Linked Devices.
                        </p>
                      </div>
                      <Zap
                        size={20}
                        className="text-cyan-300"
                      />
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <div className="flex flex-1 items-center justify-center rounded-2xl border border-white/10 bg-black/30 px-5 py-5">
                        <span className="select-all font-mono text-3xl font-black tracking-[0.35em] text-white sm:text-4xl">
                          {pairingCode}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={copyPairingCode}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-5 py-4 font-semibold transition hover:bg-white/15"
                      >
                        {copied ? (
                          <>
                            <CheckCircle2
                              size={18}
                              className="text-emerald-300"
                            />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy size={18} />
                            Copy Code
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>
            {/* Configuration */}
            <section className="rounded-3xl border border-white/10 bg-white/[0.06] p-6 shadow-2xl backdrop-blur-xl">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-violet-300">
                    Bot configuration
                  </p>
                  <h2 className="mt-1 text-xl font-bold">
                    Features
                  </h2>
                </div>
                <ShieldCheck
                  size={24}
                  className="text-violet-300"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <FeatureCard
                  icon={<Eye size={20} />}
                  title="Auto View"
                  description="Automatically view statuses."
                  enabled={features.autoView}
                  onClick={() => toggleFeature('autoView')}
                />
                <FeatureCard
                  icon={<Heart size={20} />}
                  title="Auto Like"
                  description={`React with ${DEFAULT_REACTION}`}
                  enabled={features.autoLike}
                  onClick={() => toggleFeature('autoLike')}
                />
                <FeatureCard
                  icon={<ShieldCheck size={20} />}
                  title="Anti-Delete"
                  description="Protect deleted messages."
                  enabled={features.antiDelete}
                  onClick={() => toggleFeature('antiDelete')}
                />
              </div>
            </section>
            {/* Deploy */}
            <section className="relative overflow-hidden rounded-3xl border border-blue-400/20 bg-gradient-to-r from-blue-600/20 via-violet-600/15 to-cyan-500/10 p-6 shadow-2xl sm:p-8">
              <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-blue-400/20 blur-3xl" />
              <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-blue-300">
                    <Cloud size={19} />
                    <span className="text-xs font-bold uppercase tracking-wider">
                      Render deployment
                    </span>
                  </div>
                  <h2 className="text-xl font-bold">
                    {connected
                      ? 'Your bot is online'
                      : 'Ready to launch your bot?'}
                  </h2>
                  <p className="mt-1 text-sm text-slate-400">
                    {connected
                      ? `Connected as ${displayPhone}`
                      : 'Pair WhatsApp first, then start WA-AutoBot.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={deployBot}
                  disabled={
                    deploying ||
                    connected ||
                    !cleanPhone ||
                    !pairingCode
                  }
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-white px-7 py-4 font-black text-slate-950 shadow-xl transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {deploying ? (
                    <>
                      <Loader2
                        size={19}
                        className="animate-spin"
                      />
                      Deploying...
                    </>
                  ) : connected ? (
                    <>
                      <CheckCircle2 size={19} />
                      Bot Online
                    </>
                  ) : (
                    <>
                      <Rocket size={19} />
                      Deploy Bot
                    </>
                  )}
                </button>
              </div>
            </section>
          </div>
          {/* Right */}
          <aside className="space-y-6">
            {/* Progress */}
            <section className="rounded-3xl border border-white/10 bg-white/[0.06] p-6 shadow-2xl backdrop-blur-xl">
              <div className="mb-6">
                <p className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                  Setup progress
                </p>
                <h2 className="mt-1 text-xl font-bold">
                  Connect in 4 steps
                </h2>
              </div>
              <div className="space-y-5">
                {steps.map((step, index) => (
                  <div
                    key={step.number}
                    className="flex gap-3"
                  >
                    <div className="flex flex-col items-center">
                      {step.complete ? (
                        <CheckCircle2
                          size={22}
                          className="shrink-0 text-emerald-400"
                        />
                      ) : (
                        <Circle
                          size={22}
                          className="shrink-0 text-slate-600"
                        />
                      )}
                      {index !== steps.length - 1 && (
                        <div className="mt-2 h-full min-h-8 w-px bg-white/10" />
                      )}
                    </div>
                    <div className="-mt-0.5 pb-1">
                      <p className="font-semibold">
                        {step.title}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {step.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
            {/* Instructions */}
            <section className="rounded-3xl border border-white/10 bg-white/[0.06] p-6 shadow-2xl backdrop-blur-xl">
              <div className="mb-5 flex items-center gap-3">
                <div className="rounded-xl bg-emerald-400/10 p-2.5">
                  <Smartphone
                    size={20}
                    className="text-emerald-300"
                  />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                    How to connect
                  </p>
                  <h2 className="mt-1 font-bold">
                    Link your WhatsApp
                  </h2>
                </div>
              </div>
              <ol className="space-y-4 text-sm text-slate-300">
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
                  text="Tap Link a Device."
                />
                <Instruction
                  number="4"
                  text="Choose Link with phone number."
                />
                <Instruction
                  number="5"
                  text="Enter the pairing code shown here."
                />
              </ol>
              <div className="mt-5 rounded-2xl border border-amber-400/15 bg-amber-400/5 p-4 text-xs leading-5 text-amber-200/80">
                Never share your WhatsApp pairing code with another person.
              </div>
            </section>
            {/* Trial */}
            <section className="overflow-hidden rounded-3xl border border-violet-400/20 bg-gradient-to-br from-violet-500/15 to-blue-500/10 p-6 shadow-2xl">
              <Sparkles
                size={24}
                className="mb-4 text-violet-300"
              />
              <h2 className="text-lg font-bold">
                48-hour free trial
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                No payment is required to start testing WA-AutoBot.
                Connect your WhatsApp and explore the bot features.
              </p>
              <div className="mt-5 flex items-center gap-2 text-xs font-semibold text-emerald-300">
                <CheckCircle2 size={15} />
                No payment required to start
              </div>
            </section>
            {/* External link */}
            <a
              href="https://wa.me/"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.08]"
            >
              <span className="flex items-center gap-2">
                <MessageCircle size={17} />
                Open WhatsApp
              </span>
              <ExternalLink size={16} />
            </a>
          </aside>
        </div>
        <div className="mt-8 border-t border-white/10 pt-5 text-center text-xs text-slate-600">
          WA-AutoBot • WhatsApp automation platform
        </div>
      </div>
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
      className={`group rounded-2xl border p-4 text-left transition ${
        enabled
          ? 'border-blue-400/20 bg-blue-400/10'
          : 'border-white/10 bg-black/10'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={`rounded-xl p-2.5 ${
            enabled
              ? 'bg-blue-400/15 text-blue-300'
              : 'bg-white/5 text-slate-500'
          }`}
        >
          {icon}
        </div>
        <div
          className={`h-5 w-9 rounded-full p-0.5 transition ${
            enabled
              ? 'bg-blue-500'
              : 'bg-slate-700'
          }`}
        >
          <div
            className={`h-4 w-4 rounded-full bg-white transition ${
              enabled ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </div>
      </div>
      <p className="mt-4 font-bold">
        {title}
      </p>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        {description}
      </p>
    </button>
  );
}
function Instruction({ number, text }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10 text-xs font-black text-white">
        {number}
      </span>
      <span className="pt-1 leading-5">
        {text}
      </span>
    </li>
  );
}
