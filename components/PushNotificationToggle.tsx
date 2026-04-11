'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';

// Your VAPID public key from env (exposed to client)
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = typeof window !== 'undefined' ? window.atob(base64) : atob(base64);
  const bytes = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    bytes[i] = rawData.charCodeAt(i);
  }
  return bytes.buffer;
}

export default function PushNotificationToggle() {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isSupported =
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window &&
      !!VAPID_PUBLIC_KEY;
    setSupported(isSupported);
    if (!isSupported) return;

    // Check current subscription state
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(!!sub))
      .catch(() => undefined);
  }, []);

  async function subscribe() {
    setLoading(true);
    setError('');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setError('Notification permission denied.');
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToArrayBuffer(VAPID_PUBLIC_KEY),
      });

      const subJson = sub.toJSON() as {
        endpoint: string;
        keys?: { p256dh?: string; auth?: string };
      };

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          keys: { p256dh: subJson.keys?.p256dh || '', auth: subJson.keys?.auth || '' },
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.message || 'Failed to save subscription.');
        await sub.unsubscribe().catch(() => undefined);
        return;
      }

      setSubscribed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to subscribe.');
    } finally {
      setLoading(false);
    }
  }

  async function unsubscribe() {
    setLoading(true);
    setError('');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
      setSubscribed(false);
    } catch {
      setError('Failed to unsubscribe.');
    } finally {
      setLoading(false);
    }
  }

  if (!supported) return null;

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={subscribed ? unsubscribe : subscribe}
        disabled={loading}
        className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
          subscribed
            ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
            : 'border-saffron-200 bg-saffron-50 text-saffron-700 hover:bg-saffron-100'
        }`}
        aria-label={subscribed ? 'Unsubscribe from push notifications' : 'Subscribe to push notifications'}
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : subscribed ? (
          <BellOff className="w-3.5 h-3.5" />
        ) : (
          <Bell className="w-3.5 h-3.5" />
        )}
        {loading ? 'Processing…' : subscribed ? 'Notifications On' : 'Enable Notifications'}
      </button>
      {error && <p className="text-[11px] text-rose-700">{error}</p>}
    </div>
  );
}
