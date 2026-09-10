import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  Copy,
  Eye,
  Heart,
  Loader2,
  MessageCircle,
  Play,
  Rocket,
  ShieldCheck,
  Smartphone,
  Zap,
  Wifi,
  Server,
} from 'lucide-react';

const API_BASE =
  import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export default function Deployment() {
  const [phone, setPhone] = useState(
    () => localStorage.getItem('wa_autobot_phone') || ''
  );

  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [whatsappConnected, setWhatsappConnected] = useState(false);
  const [account, setAccount] = useState(null);

  const pollingRef = useRef(null);
  const pairingPollingRef = useRef(null);

  const cleanPhone = String(phone || '').replace(/\D/g, '');

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    if (pairingPollingRef.current) {
      clearInterval(pairingPollingRef.current);
      pairingPollingRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, []);

  const checkConnectionStatus = async targetPhone => {
    const clean = String(targetPhone || '').replace(/\D/g, '');

    if (!clean) return;

    try {
      const response = await fetch(
        `${API_BASE}/pair/status/${clean}`
      );

      const result = await response.json();

      if (!response.ok || result?.success !== true) {
        return;
      }

      const data = result?.data || {};
      const accountData = data?.account || {};
      const whatsappData = data?.whatsapp || {};

      setAccount(accountData);

      const connected =
        accountData?.connected === true ||
        whatsappData?.connected === true ||
        whatsappData?.status === 'connected' ||
        whatsappData?.state === 'connected';

      setWhatsappConnected(connected);

      if (connected) {
        setStatus('online');
        setMessage(
          'WhatsApp connected successfully. WA-AutoBot is online.'
        );

        if (pairingPollingRef.current) {
          clearInterval(pairingPollingRef.current);
          pairingPollingRef.current = null;
        }
      }
    } catch (error) {
      console.error(
        '[Deployment] Status check error:',
        error
      );
    }
  };

  const startStatusPolling = targetPhone => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }

    const clean = String(targetPhone || '').replace(/\D/g, '');

    if (!clean) return;

    checkConnectionStatus(clean);

    pollingRef.current = setInterval(() => {
      checkConnectionStatus(clean);
    }, 3000);
  };

  const startPairing = async () => {
    if (!cleanPhone) {
      setStatus('error');
      setMessage(
        'Please enter your WhatsApp phone number first.'
      );
      return;
    }

    if (cleanPhone.length < 8) {
      setStatus('error');
      setMessage(
        'Please enter a valid WhatsApp phone number.'
      );
      return;
    }

    stopPolling();

    setStatus('registering');
    setMessage(
      'Connecting to the WA-AutoBot pairing service...'
    );

    setPairingCode('');
    setWhatsappConnected(false);

    try {
      const response = await fetch(
        `${API_BASE}/pair/register`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            phone: cleanPhone,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || result?.success !== true) {
        throw new Error(
          result?.message ||
            'Unable to start WhatsApp pairing.'
        );
      }

      localStorage.setItem(
        'wa_autobot_phone',
        cleanPhone
      );

      setPhone(cleanPhone);
      setAccount(result?.data || null);
      setStatus('pairing');

      setMessage(
        'Pairing has started. Your WhatsApp pairing code will appear below.'
      );

      pollPairingCode(cleanPhone);
      startStatusPolling(cleanPhone);
    } catch (error) {
      console.error(
        '[Deployment] Pairing registration error:',
        error
      );

      setStatus('error');
      setMessage(
        error?.message ||
          'Unable to start WhatsApp pairing.'
      );
    }
  };

  const pollPairingCode = targetPhone => {
    const clean = String(targetPhone || '').replace(/\D/g, '');

    if (!clean) return;

    let attempts = 0;
    const maxAttempts = 100;

    const poll = async () => {
      attempts += 1;

      try {
        const response = await fetch(
          `${API_BASE}/pair/pairing-code/${clean}`
        );

        const result = await response.json();

        if (!response.ok || result?.success !== true) {
          if (attempts >= maxAttempts) {
            setStatus('error');
            setMessage(
              result?.message ||
                'Unable to retrieve the pairing code.'
            );
          }

          return;
        }

        const data = result?.data || {};
        const code = data?.pairingCode;

        if (code) {
          setPairingCode(String(code));
          setStatus('pairing');

          setMessage(
            'Pairing code ready. Enter this code in WhatsApp Linked Devices.'
          );
        }
      } catch (error) {
        console.error(
          '[Deployment] Pairing code error:',
          error
        );

        if (attempts >= maxAttempts) {
          setStatus('error');
          setMessage(
            'Unable to contact the pairing service.'
          );
        }
      }
    };

    poll();

    pairingPollingRef.current = setInterval(() => {
      if (
        attempts >= maxAttempts ||
        whatsappConnected
      ) {
        clearInterval(pairingPollingRef.current);
        pairingPollingRef.current = null;
        return;
      }

      poll();
    }, 3000);
  };

  const deployBot = async () => {
    if (!cleanPhone) {
      setStatus('error');
      setMessage(
        'Enter your WhatsApp phone number before starting the bot.'
      );
      return;
    }

    localStorage.setItem(
      'wa_autobot_phone',
      cleanPhone
    );

    setStatus('deploying');
    setMessage(
      'Starting your WA-AutoBot account on the server...'
    );

    try {
      const response = await fetch(
        `${API_BASE}/accounts/${cleanPhone}/start`,
        {
          method: 'POST',
        }
      );

      const result = await response.json();

      if (!response.ok || result?.success !== true) {
        throw new Error(
          result?.message ||
            'Unable to start the bot.'
        );
      }

      setStatus('pairing');

      setMessage(
        'Bot started. Waiting for WhatsApp connection...'
      );

      startStatusPolling(cleanPhone);
      pollPairingCode(cleanPhone);
    } catch (error) {
      console.error(
        '[Deployment] Deployment error:',
        error
      );

      setStatus('error');
      setMessage(
        error?.message ||
          'Unable to start WA-AutoBot.'
      );
    }
  };

  const copyPairingCode = async () => {
    if (!pairingCode) return;

    try {
      await navigator.clipboard.writeText(
        pairingCode
      );

      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      console.error(
        '[Deployment] Copy error:',
        error
      );
    }
  };

  const getStatusText = () => {
    if (
      whatsappConnected ||
      status === 'online'
    ) {
      return 'ONLINE';
    }

    if (
      status === 'pairing' ||
      status === 'registering' ||
      status === 'deploying'
    ) {
      return 'CONNECTING';
    }

    if (status === 'error') {
      return 'ERROR';
    }

    return 'READY';
  };

  const statusText = getStatusText();

  const isBusy =
    status === 'registering' ||
    status === 'deploying';

  return (
    <div className="relative min-h-full overflow-hidden rounded-3xl bg-slate-950 p-4 text-white sm:p-6 lg:p-8">
      {/* Background lighting */}
      <div className="pointer-events-none absolute -left-32 -top-32 h-80 w-80 rounded-full bg-blue-600/20 blur-3xl" />

      <div className="pointer-events-none absolute -right-32 top-20 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />

      <div className="pointer-events-none absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-indigo-600/10 blur-3xl" />

      <div className="relative z-10 space-y-6">
        {/* HERO */}
        <div className="overflow-hidden rounded-3xl border border-blue-400/20 bg-gradient-to-br from-blue-950 via-slate-900 to-slate-950 p-6 shadow-2xl shadow-blue-950/30 sm:p-8">
          <div className="flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/20 ring-1 ring-blue-400/30">
                  <Rocket
                    size={24}
                    className="text-blue-300"
                  />
                </div>

                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.25em] text-blue-300">
                    WA-AutoBot
                  </p>

                  <p className="text-xs text-slate-400">
                    Deployment Center
                  </p>
                </div>
              </div>

              <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
                Deploy your WhatsApp bot
              </h2>

              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">
                Connect your WhatsApp account, receive your
                pairing code and bring WA-AutoBot online.
              </p>
            </div>

            {/* Status */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl lg:min-w-[190px]">
              <div className="flex items-center gap-3">
                <div
                  className={`h-3 w-3 rounded-full ${
                    whatsappConnected
                      ? 'animate-pulse bg-emerald-400 shadow-lg shadow-emerald-400/70'
                      : status === 'error'
                      ? 'bg-red-400'
                      : 'animate-pulse bg-blue-400 shadow-lg shadow-blue-400/70'
                  }`}
                />

                <span className="text-xs font-black tracking-[0.2em] text-slate-300">
                  {statusText}
                </span>
              </div>

              <div className="mt-4 text-2xl font-black">
                {whatsappConnected
                  ? 'Connected'
                  : status === 'pairing'
                  ? 'Pairing'
                  : 'Ready'}
              </div>
            </div>
          </div>
        </div>

        {/* MAIN GRID */}
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          {/* PHONE CARD */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.045] p-6 shadow-xl backdrop-blur-xl sm:p-7">
            <div className="mb-6 flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-500/15 ring-1 ring-blue-400/20">
                <Smartphone
                  size={23}
                  className="text-blue-300"
                />
              </div>

              <div>
                <h3 className="text-xl font-bold">
                  WhatsApp Account
                </h3>

                <p className="mt-1 text-sm text-slate-400">
                  Enter the number that will run your bot.
                </p>
              </div>
            </div>

            <label className="mb-3 block text-sm font-bold text-slate-200">
              WhatsApp Phone Number
            </label>

            {/* VERY VISIBLE PHONE INPUT */}
            <div className="rounded-2xl border border-blue-400/30 bg-slate-950/80 p-2 shadow-inner shadow-blue-950/30">
              <div className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-4">
                <span className="text-lg text-blue-300">
                  +
                </span>

                <input
                  type="tel"
                  value={phone}
                  onChange={event =>
                    setPhone(event.target.value)
                  }
                  placeholder="233554279349"
                  disabled={isBusy}
                  className="w-full bg-transparent py-4 text-lg font-semibold tracking-wide text-white outline-none placeholder:text-slate-600 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            <p className="mt-3 text-xs text-slate-500">
              Example: 233554279349 — use your country
              code and do not include spaces.
            </p>

            <button
              type="button"
              onClick={startPairing}
              disabled={!cleanPhone || isBusy}
              className="mt-6 flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 px-5 py-4 text-sm font-black shadow-lg shadow-blue-950/50 transition hover:-translate-y-0.5 hover:from-blue-500 hover:to-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {status === 'registering' ? (
                <>
                  <Loader2
                    size={19}
                    className="animate-spin"
                  />
                  STARTING PAIRING...
                </>
              ) : (
                <>
                  <MessageCircle size={19} />
                  GET WHATSAPP PAIRING CODE
                </>
              )}
            </button>

            {/* Message */}
            {message && (
              <div
                className={`mt-5 rounded-2xl border p-4 ${
                  status === 'error'
                    ? 'border-red-400/20 bg-red-500/10 text-red-200'
                    : whatsappConnected
                    ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200'
                    : 'border-blue-400/20 bg-blue-500/10 text-blue-200'
                }`}
              >
                <div className="flex gap-3">
                  {whatsappConnected ? (
                    <CheckCircle2
                      size={18}
                      className="mt-0.5 shrink-0"
                    />
                  ) : (
                    <Wifi
                      size={18}
                      className="mt-0.5 shrink-0"
                    />
                  )}

                  <p className="text-sm leading-5">
                    {message}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* FEATURES */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.045] p-6 shadow-xl backdrop-blur-xl sm:p-7">
            <div className="mb-6">
              <div className="mb-2 flex items-center gap-2">
                <Zap
                  size={18}
                  className="text-cyan-300"
                />

                <span className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">
                  Active Configuration
                </span>
              </div>

              <h3 className="text-xl font-bold">
                Bot Features
              </h3>
            </div>

            <div className="space-y-3">
              <Feature
                icon={<Eye size={19} />}
                title="Auto View Status"
                description="Automatically view WhatsApp statuses."
                enabled
              />

              <Feature
                icon={<Heart size={19} />}
                title="Auto Like Status"
                description="Automatically react to statuses."
                enabled
              />

              <Feature
                icon={<ShieldCheck size={19} />}
                title="Anti-Delete"
                description="Keep records of deleted messages."
                enabled
              />

              <Feature
                icon={<ShieldCheck size={19} />}
                title="Admin Protection"
                description="Temporarily disabled during testing."
                enabled={false}
              />
            </div>
          </div>
        </div>

        {/* PAIRING CODE */}
        {pairingCode && !whatsappConnected && (
          <div className="relative overflow-hidden rounded-3xl border border-cyan-400/25 bg-gradient-to-br from-cyan-950/50 via-blue-950/40 to-slate-950 p-6 shadow-2xl shadow-cyan-950/20 sm:p-8">
            <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />

            <div className="relative">
              <div className="mb-6 flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-400/10 ring-1 ring-cyan-300/20">
                  <MessageCircle
                    size={23}
                    className="text-cyan-300"
                  />
                </div>

                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">
                    Pairing Required
                  </p>

                  <h3 className="text-xl font-bold">
                    Your WhatsApp Pairing Code
                  </h3>
                </div>
              </div>

              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="max-w-xl text-sm leading-6 text-slate-300">
                    Open WhatsApp on your phone, go to
                    <span className="font-bold text-white">
                      {' '}
                      Linked Devices
                    </span>
                    , choose
                    <span className="font-bold text-white">
                      {' '}
                      Link a Device
                    </span>
                    , then select the phone-number pairing
                    option.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="rounded-2xl border border-cyan-300/20 bg-black/30 px-6 py-5 shadow-inner">
                    <span className="font-mono text-2xl font-black tracking-[0.3em] text-cyan-200 sm:text-3xl">
                      {pairingCode}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={copyPairingCode}
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10"
                    title="Copy pairing code"
                  >
                    {copied ? (
                      <CheckCircle2
                        size={21}
                        className="text-emerald-400"
                      />
                    ) : (
                      <Copy size={21} />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CONNECTION / SERVER */}
        <div className="grid gap-6 md:grid-cols-2">
          <div
            className={`rounded-3xl border p-6 ${
              whatsappConnected
                ? 'border-emerald-400/20 bg-emerald-500/[0.06]'
                : 'border-white/10 bg-white/[0.035]'
            }`}
          >
            <div className="flex items-center gap-4">
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                  whatsappConnected
                    ? 'bg-emerald-400/10 text-emerald-300'
                    : 'bg-white/5 text-slate-400'
                }`}
              >
                {whatsappConnected ? (
                  <CheckCircle2 size={23} />
                ) : (
                  <Wifi size={23} />
                )}
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  WhatsApp Connection
                </p>

                <h3 className="mt-1 text-lg font-bold">
                  {whatsappConnected
                    ? 'WhatsApp Connected'
                    : 'Waiting for Connection'}
                </h3>

                {account?.phone && (
                  <p className="mt-1 text-xs text-slate-500">
                    Account: {account.phone}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-400/10 text-blue-300">
                <Server size={23} />
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Bot Server
                </p>

                <h3 className="mt-1 text-lg font-bold">
                  Render Backend
                </h3>

                <p className="mt-1 text-xs text-emerald-400">
                  API connection configured
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* DEPLOY BUTTON */}
        <div className="overflow-hidden rounded-3xl border border-blue-400/20 bg-gradient-to-r from-blue-950/80 via-slate-900 to-slate-950 p-6 shadow-2xl sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Rocket
                  size={17}
                  className="text-blue-300"
                />

                <span className="text-xs font-black uppercase tracking-[0.2em] text-blue-300">
                  Deployment
                </span>
              </div>

              <h3 className="text-xl font-bold">
                Start WA-AutoBot
              </h3>

              <p className="mt-1 text-sm text-slate-400">
                Start the server-side WhatsApp account and
                monitor its connection.
              </p>
            </div>

            <button
              type="button"
              onClick={deployBot}
              disabled={!cleanPhone || isBusy}
              className="flex min-w-[190px] items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-6 py-4 text-sm font-black text-slate-950 shadow-xl shadow-cyan-950/30 transition hover:-translate-y-0.5 hover:from-emerald-400 hover:to-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {status === 'deploying' ? (
                <>
                  <Loader2
                    size={19}
                    className="animate-spin"
                  />
                  STARTING...
                </>
              ) : (
                <>
                  <Play size={19} />
                  DEPLOY BOT
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Feature({
  icon,
  title,
  description,
  enabled,
}) {
  return (
    <div className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-black/10 p-4 transition hover:border-blue-400/20 hover:bg-blue-500/[0.04]">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          enabled
            ? 'bg-blue-500/10 text-blue-300 ring-1 ring-blue-400/10'
            : 'bg-white/5 text-slate-600'
        }`}
      >
        {icon}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-bold text-white">
            {title}
          </h4>

          {enabled ? (
            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-300">
              Enabled
            </span>
          ) : (
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-slate-500">
              Off
            </span>
          )}
        </div>

        <p className="mt-1 text-xs leading-5 text-slate-500">
          {description}
        </p>
      </div>
    </div>
  );
}
