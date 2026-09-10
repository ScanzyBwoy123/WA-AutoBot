import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  Copy,
  Loader2,
  MessageCircle,
  Play,
  Rocket,
  ShieldCheck,
  Smartphone,
  Heart,
  Eye,
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

  const cleanPhone = String(phone || '').replace(/\D/g, '');

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
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
        setMessage('WhatsApp is connected. WA-AutoBot is online.');
        stopPolling();
      }
    } catch (error) {
      console.error('[Deployment] Status check error:', error);
    }
  };

  const startStatusPolling = targetPhone => {
    stopPolling();

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
      setMessage('Enter your WhatsApp phone number first.');
      return;
    }

    if (cleanPhone.length < 8) {
      setStatus('error');
      setMessage('Enter a valid WhatsApp phone number.');
      return;
    }

    stopPolling();

    setStatus('registering');
    setMessage('Starting WhatsApp pairing...');
    setPairingCode('');
    setWhatsappConnected(false);

    try {
      const response = await fetch(`${API_BASE}/pair/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: cleanPhone,
        }),
      });

      const result = await response.json();

      if (!response.ok || result?.success !== true) {
        throw new Error(
          result?.message || 'Unable to start WhatsApp pairing.'
        );
      }

      // Save the phone so the main dashboard knows which account
      // belongs to this browser.
      localStorage.setItem('wa_autobot_phone', cleanPhone);

      setPhone(cleanPhone);
      setAccount(result?.data || null);
      setStatus('pairing');
      setMessage(
        'Pairing started. Waiting for your WhatsApp pairing code...'
      );

      pollPairingCode(cleanPhone);
      startStatusPolling(cleanPhone);
    } catch (error) {
      console.error('[Deployment] Pairing registration error:', error);

      setStatus('error');
      setMessage(
        error?.message || 'Unable to start WhatsApp pairing.'
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

        // Backend response:
        // {
        //   success: true,
        //   data: {
        //     phone,
        //     available,
        //     pairingCode
        //   }
        // }
        const data = result?.data || {};
        const code = data?.pairingCode;

        if (code) {
          setPairingCode(String(code));
          setStatus('pairing');
          setMessage(
            'Pairing code ready. Enter it in WhatsApp Linked Devices.'
          );
        }

        if (attempts >= maxAttempts) {
          setStatus(current => {
            if (current === 'online') return current;
            return current;
          });
        }
      } catch (error) {
        console.error('[Deployment] Pairing code error:', error);

        if (attempts >= maxAttempts) {
          setStatus('error');
          setMessage(
            'Unable to contact the pairing service.'
          );
        }
      }
    };

    poll();

    const interval = setInterval(() => {
      if (attempts >= maxAttempts || whatsappConnected) {
        clearInterval(interval);
        return;
      }

      poll();
    }, 3000);
  };

  const deployBot = async () => {
    if (!cleanPhone) {
      setStatus('error');
      setMessage(
        'Enter your WhatsApp phone number before deploying.'
      );
      return;
    }

    localStorage.setItem('wa_autobot_phone', cleanPhone);

    setStatus('deploying');
    setMessage('Starting WA-AutoBot...');

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
          result?.message || 'Unable to start the bot.'
        );
      }

      setStatus('pairing');
      setMessage(
        'Bot started. Waiting for WhatsApp connection...'
      );

      startStatusPolling(cleanPhone);
      pollPairingCode(cleanPhone);
    } catch (error) {
      console.error('[Deployment] Deployment error:', error);

      setStatus('error');
      setMessage(
        error?.message || 'Unable to start WA-AutoBot.'
      );
    }
  };

  const copyPairingCode = async () => {
    if (!pairingCode) return;

    try {
      await navigator.clipboard.writeText(pairingCode);

      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      console.error('[Deployment] Copy error:', error);
    }
  };

  const getStatusLabel = () => {
    if (whatsappConnected || status === 'online') {
      return 'Connected';
    }

    if (
      status === 'registering' ||
      status === 'pairing' ||
      status === 'deploying'
    ) {
      return 'Connecting';
    }

    if (status === 'error') {
      return 'Error';
    }

    return 'Ready';
  };

  const statusLabel = getStatusLabel();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white">
                <Rocket size={22} />
              </div>

              <div>
                <h2 className="text-2xl font-bold text-slate-900">
                  Bot Deployment
                </h2>

                <p className="text-sm text-slate-500">
                  Connect WhatsApp and bring WA-AutoBot online.
                </p>
              </div>
            </div>
          </div>

          <div
            className={`inline-flex w-fit items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${
              whatsappConnected || status === 'online'
                ? 'bg-emerald-50 text-emerald-700'
                : status === 'error'
                ? 'bg-red-50 text-red-700'
                : status === 'pairing' ||
                  status === 'registering' ||
                  status === 'deploying'
                ? 'bg-amber-50 text-amber-700'
                : 'bg-slate-100 text-slate-700'
            }`}
          >
            {whatsappConnected || status === 'online' ? (
              <CheckCircle2 size={16} />
            ) : status === 'pairing' ||
              status === 'registering' ||
              status === 'deploying' ? (
              <Loader2
                size={16}
                className="animate-spin"
              />
            ) : (
              <Circle size={16} />
            )}

            {statusLabel}
          </div>
        </div>
      </div>

      {/* Deployment configuration */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
              <Smartphone
                size={20}
                className="text-slate-700"
              />
            </div>

            <div>
              <h3 className="font-bold text-slate-900">
                WhatsApp Account
              </h3>

              <p className="text-sm text-slate-500">
                Enter the number that will run the bot.
              </p>
            </div>
          </div>

          <label className="mb-2 block text-sm font-semibold text-slate-700">
            WhatsApp Phone Number
          </label>

          <input
            type="tel"
            value={phone}
            onChange={event => setPhone(event.target.value)}
            placeholder="233554279349"
            disabled={
              status === 'registering' ||
              status === 'deploying'
            }
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-100"
          />

          <p className="mt-2 text-xs text-slate-500">
            Use the international format without spaces.
          </p>

          <button
            type="button"
            onClick={startPairing}
            disabled={
              !cleanPhone ||
              status === 'registering' ||
              status === 'deploying'
            }
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === 'registering' ? (
              <>
                <Loader2
                  size={18}
                  className="animate-spin"
                />
                Starting Pairing...
              </>
            ) : (
              <>
                <MessageCircle size={18} />
                Start WhatsApp Pairing
              </>
            )}
          </button>
        </div>

        {/* Features */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-5 font-bold text-slate-900">
            Bot Features
          </h3>

          <div className="space-y-3">
            <Feature
              icon={<Eye size={18} />}
              title="Auto View Status"
              description="Automatically view WhatsApp statuses."
              enabled
            />

            <Feature
              icon={<Heart size={18} />}
              title="Auto Like Status"
              description="Automatically react to statuses."
              enabled
            />

            <Feature
              icon={<ShieldCheck size={18} />}
              title="Anti-Delete"
              description="Keep a record of deleted messages."
              enabled
            />

            <Feature
              icon={<ShieldCheck size={18} />}
              title="Admin Protection"
              description="Currently disabled while the system is being tested."
              enabled={false}
            />
          </div>
        </div>
      </div>

      {/* Pairing code */}
      {pairingCode && !whatsappConnected && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="mb-1 flex items-center gap-2">
                <MessageCircle
                  size={20}
                  className="text-blue-700"
                />

                <h3 className="font-bold text-blue-900">
                  WhatsApp Pairing Code
                </h3>
              </div>

              <p className="text-sm text-blue-700">
                Open WhatsApp → Linked Devices → Link a
                Device → Link with phone number.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="rounded-xl border border-blue-200 bg-white px-5 py-3 font-mono text-xl font-bold tracking-[0.25em] text-slate-900">
                {pairingCode}
              </div>

              <button
                type="button"
                onClick={copyPairingCode}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-slate-700 shadow-sm transition hover:bg-slate-100"
                title="Copy pairing code"
              >
                {copied ? (
                  <CheckCircle2
                    size={18}
                    className="text-emerald-600"
                  />
                ) : (
                  <Copy size={18} />
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Connection status */}
      <div
        className={`rounded-2xl border p-6 ${
          whatsappConnected || status === 'online'
            ? 'border-emerald-200 bg-emerald-50'
            : status === 'error'
            ? 'border-red-200 bg-red-50'
            : 'border-slate-200 bg-white'
        }`}
      >
        <div className="flex items-start gap-4">
          <div
            className={`mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              whatsappConnected || status === 'online'
                ? 'bg-emerald-100 text-emerald-700'
                : status === 'error'
                ? 'bg-red-100 text-red-700'
                : 'bg-slate-100 text-slate-700'
            }`}
          >
            {whatsappConnected || status === 'online' ? (
              <CheckCircle2 size={20} />
            ) : status === 'error' ? (
              <Circle size={20} />
            ) : (
              <Loader2
                size={20}
                className={
                  status === 'pairing' ||
                  status === 'registering' ||
                  status === 'deploying'
                    ? 'animate-spin'
                    : ''
                }
              />
            )}
          </div>

          <div className="flex-1">
            <h3 className="font-bold text-slate-900">
              {whatsappConnected || status === 'online'
                ? 'WhatsApp Connected'
                : status === 'error'
                ? 'Connection Error'
                : 'WhatsApp Connection'}
            </h3>

            <p className="mt-1 text-sm text-slate-600">
              {message ||
                'Start pairing to connect your WhatsApp account.'}
            </p>

            {account?.phone && (
              <p className="mt-2 text-xs font-medium text-slate-500">
                Account: {account.phone}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Deploy */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="font-bold text-slate-900">
              Start WA-AutoBot
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              Start the backend account and monitor the
              WhatsApp connection.
            </p>
          </div>

          <button
            type="button"
            onClick={deployBot}
            disabled={
              !cleanPhone ||
              status === 'deploying' ||
              status === 'registering'
            }
            className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === 'deploying' ? (
              <>
                <Loader2
                  size={18}
                  className="animate-spin"
                />
                Starting...
              </>
            ) : (
              <>
                <Play size={18} />
                Start Bot
              </>
            )}
          </button>
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
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          enabled
            ? 'bg-emerald-50 text-emerald-600'
            : 'bg-slate-100 text-slate-400'
        }`}
      >
        {icon}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold text-slate-900">
            {title}
          </h4>

          {enabled ? (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
              Enabled
            </span>
          ) : (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Off
            </span>
          )}
        </div>

        <p className="text-xs text-slate-500">
          {description}
        </p>
      </div>
    </div>
  );
}
