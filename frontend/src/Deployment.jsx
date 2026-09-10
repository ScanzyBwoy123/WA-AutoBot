import React, { useState } from 'react';
import {
  Smartphone,
  Eye,
  Heart,
  ShieldCheck,
  Trash2,
  Settings,
  Copy,
  CheckCircle2,
  Loader2,
  Rocket,
  Wifi,
  AlertCircle
} from 'lucide-react';

const API_BASE =
  import.meta.env.VITE_API_URL || '';

const defaultConfig = {
  autoViewStatus: true,
  autoLikeStatus: true,
  antiDelete: true,
  adminProtection: false,
  reaction: '❤️',
  botName: 'WA-AutoBot',
  prefix: '.'
};

export default function Deployment() {
  const [config, setConfig] = useState(defaultConfig);
  const [phone, setPhone] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);

  const updateConfig = (key, value) => {
    setConfig(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const startPairing = async () => {
    const cleanPhone = phone.replace(/\D/g, '');

    if (!cleanPhone) {
      setStatus('error');
      setMessage('Please enter your WhatsApp phone number.');
      return;
    }

    setStatus('loading');
    setMessage('');
    setPairingCode('');

    try {
      const response = await fetch(
        `${API_BASE}/api/pair/register`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            phone: cleanPhone
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.message ||
          data?.error ||
          'Unable to start pairing.'
        );
      }

      setStatus('pairing');
      setMessage(
        'WhatsApp pairing has started. Waiting for your pairing code...'
      );

      pollPairingCode(cleanPhone);
    } catch (error) {
      console.error(
        '[Deployment] Pairing error:',
        error
      );

      setStatus('error');
      setMessage(
        error.message ||
        'Unable to connect to the bot server.'
      );
    }
  };

  const pollPairingCode = async cleanPhone => {
    let attempts = 0;
    const maxAttempts = 30;

    const check = async () => {
      attempts += 1;

      try {
        const response = await fetch(
          `${API_BASE}/api/pair/pairing-code/${cleanPhone}`
        );

        const data = await response.json();

        if (
          response.ok &&
          data?.pairingCode
        ) {
          setPairingCode(
            String(data.pairingCode)
          );

          setStatus('code');
          setMessage(
            'Your pairing code is ready.'
          );

          return;
        }
      } catch (error) {
        console.error(
          '[Deployment] Pairing-code error:',
          error
        );
      }

      if (attempts < maxAttempts) {
        setTimeout(check, 2000);
      } else {
        setStatus('error');
        setMessage(
          'Pairing code was not received. Please try again.'
        );
      }
    };

    check();
  };

  const copyCode = async () => {
    if (!pairingCode) {
      return;
    }

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

  const deployBot = () => {
    setStatus('deploying');

    setTimeout(() => {
      setStatus('online');
      setMessage(
        'WA-AutoBot deployment is ready.'
      );
    }, 1200);
  };

  const Toggle = ({
    label,
    description,
    icon: Icon,
    value,
    onChange
  }) => {
    return (
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100">
            <Icon
              size={19}
              className="text-slate-700"
            />
          </div>

          <div className="min-w-0">
            <p className="font-semibold text-slate-900">
              {label}
            </p>

            <p className="text-sm text-slate-500">
              {description}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onChange(!value)}
          className={`relative h-7 w-12 shrink-0 rounded-full transition ${
            value
              ? 'bg-emerald-500'
              : 'bg-slate-300'
          }`}
          aria-label={`${label} ${
            value ? 'enabled' : 'disabled'
          }`}
        >
          <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${
              value
                ? 'left-6'
                : 'left-1'
            }`}
          />
        </button>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 text-slate-900 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8 rounded-3xl bg-slate-900 p-6 text-white shadow-xl sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
                  <Rocket size={25} />
                </div>

                <div>
                  <p className="text-sm font-medium text-slate-300">
                    WhatsApp Automation
                  </p>

                  <h1 className="text-2xl font-bold sm:text-3xl">
                    WA-AutoBot
                  </h1>
                </div>
              </div>

              <p className="max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                Configure your bot, connect WhatsApp with
                a pairing code and manage your bot deployment
                from one place.
              </p>
            </div>

            <div className="flex items-center gap-2 rounded-full bg-emerald-500/15 px-4 py-2 text-sm text-emerald-300">
              <Wifi size={17} />
              Render Deployment
            </div>
          </div>
        </div>

        {/* Main grid */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Configuration */}
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100">
                <Settings size={21} />
              </div>

              <div>
                <h2 className="text-xl font-bold">
                  Bot Configuration
                </h2>

                <p className="text-sm text-slate-500">
                  Choose how your bot should operate.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <Toggle
                icon={Eye}
                label="Auto View Status"
                description="Automatically view WhatsApp statuses."
                value={config.autoViewStatus}
                onChange={value =>
                  updateConfig(
                    'autoViewStatus',
                    value
                  )
                }
              />

              <Toggle
                icon={Heart}
                label="Auto Like Status"
                description="Automatically react to statuses."
                value={config.autoLikeStatus}
                onChange={value =>
                  updateConfig(
                    'autoLikeStatus',
                    value
                  )
                }
              />

              <Toggle
                icon={Trash2}
                label="Anti-Delete"
                description="Keep deleted messages available to the bot."
                value={config.antiDelete}
                onChange={value =>
                  updateConfig(
                    'antiDelete',
                    value
                  )
                }
              />

              <Toggle
                icon={ShieldCheck}
                label="Admin Protection"
                description="Protect the admin from abusive messages."
                value={config.adminProtection}
                onChange={value =>
                  updateConfig(
                    'adminProtection',
                    value
                  )
                }
              />
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold">
                  Bot Name
                </span>

                <input
                  type="text"
                  value={config.botName}
                  onChange={event =>
                    updateConfig(
                      'botName',
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-slate-500"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold">
                  Command Prefix
                </span>

                <input
                  type="text"
                  value={config.prefix}
                  maxLength={3}
                  onChange={event =>
                    updateConfig(
                      'prefix',
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-slate-500"
                />
              </label>
            </div>

            <label className="mt-4 block">
              <span className="mb-2 block text-sm font-semibold">
                Status Reaction
              </span>

              <select
                value={config.reaction}
                onChange={event =>
                  updateConfig(
                    'reaction',
                    event.target.value
                  )
                }
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-slate-500"
              >
                <option value="❤️">
                  ❤️ Love
                </option>

                <option value="👍">
                  👍 Like
                </option>

                <option value="🔥">
                  🔥 Fire
                </option>

                <option value="😂">
                  😂 Funny
                </option>

                <option value="😍">
                  😍 Amazing
                </option>

                <option value="👏">
                  👏 Clap
                </option>
              </select>
            </label>
          </section>

          {/* WhatsApp connection */}
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100">
                <Smartphone size={21} />
              </div>

              <div>
                <h2 className="text-xl font-bold">
                  Connect WhatsApp
                </h2>

                <p className="text-sm text-slate-500">
                  Link your WhatsApp account to the bot.
                </p>
              </div>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold">
                WhatsApp Phone Number
              </span>

              <input
                type="tel"
                placeholder="233XXXXXXXXX"
                value={phone}
                onChange={event =>
                  setPhone(event.target.value)
                }
                className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-slate-500"
              />

              <p className="mt-2 text-xs text-slate-500">
                Enter your number with country code.
              </p>
            </label>

            <button
              type="button"
              onClick={startPairing}
              disabled={
                status === 'loading' ||
                status === 'pairing'
              }
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3.5 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {status === 'loading' ||
              status === 'pairing' ? (
                <>
                  <Loader2
                    size={18}
                    className="animate-spin"
                  />
                  Connecting...
                </>
              ) : (
                <>
                  <Smartphone size={18} />
                  Get Pairing Code
                </>
              )}
            </button>

            {pairingCode && (
              <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                <div className="mb-3 flex items-center gap-2 text-emerald-700">
                  <CheckCircle2 size={19} />

                  <span className="font-semibold">
                    Pairing Code Ready
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1 rounded-xl bg-white px-4 py-4 text-center font-mono text-xl font-bold tracking-[0.25em] text-slate-900">
                    {pairingCode}
                  </div>

                  <button
                    type="button"
                    onClick={copyCode}
                    className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-white"
                    aria-label="Copy pairing code"
                  >
                    {copied ? (
                      <CheckCircle2 size={19} />
                    ) : (
                      <Copy size={19} />
                    )}
                  </button>
                </div>

                <p className="mt-4 text-sm leading-6 text-emerald-800">
                  Open WhatsApp → Linked Devices →
                  Link a Device → Link with phone number
                  and enter this code.
                </p>
              </div>
            )}

            {message && (
              <div
                className={`mt-5 flex items-start gap-3 rounded-xl p-4 text-sm ${
                  status === 'error'
                    ? 'bg-red-50 text-red-700'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                {status === 'error' ? (
                  <AlertCircle
                    size={18}
                    className="mt-0.5 shrink-0"
                  />
                ) : (
                  <CheckCircle2
                    size={18}
                    className="mt-0.5 shrink-0"
                  />
                )}

                <span>{message}</span>
              </div>
            )}
          </section>
        </div>

        {/* Deployment status */}
        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">
                Deployment Status
              </p>

              <div className="mt-1 flex items-center gap-2">
                <span
                  className={`h-3 w-3 rounded-full ${
                    status === 'online'
                      ? 'bg-emerald-500'
                      : status === 'error'
                      ? 'bg-red-500'
                      : 'bg-amber-400'
                  }`}
                />

                <h2 className="text-xl font-bold">
                  {status === 'online'
                    ? 'Bot Online'
                    : status === 'deploying'
                    ? 'Deploying...'
                    : status === 'code'
                    ? 'WhatsApp Pairing Ready'
                    : 'Waiting for Deployment'}
                </h2>
              </div>
            </div>

            <button
              type="button"
              onClick={deployBot}
              disabled={
                status === 'deploying'
              }
              className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {status === 'deploying' ? (
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
                </>
              )}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
