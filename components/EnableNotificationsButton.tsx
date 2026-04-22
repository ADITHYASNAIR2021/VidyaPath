'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing } from 'lucide-react';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const buf = new ArrayBuffer(rawData.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < rawData.length; i++) view[i] = rawData.charCodeAt(i);
  return buf;
}

type Status = 'idle' | 'enabling' | 'enabled' | 'denied' | 'unsupported';

export default function EnableNotificationsButton() {
  const [status, setStatus] = useState<Status>('idle');

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported');
      return;
    }
    if (Notification.permission === 'granted') setStatus('enabled');
    else if (Notification.permission === 'denied') setStatus('denied');
  }, []);

  if (status === 'unsupported' || !VAPID_PUBLIC_KEY) return null;

  async function enable() {
    setStatus('enabling');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setStatus('denied'); return; }

      const sw = await navigator.serviceWorker.ready;
      const existing = await sw.pushManager.getSubscription();
      const sub = existing ?? await sw.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const p256dhKey = sub.getKey('p256dh');
      const authKey = sub.getKey('auth');
      if (!p256dhKey || !authKey) { setStatus('idle'); return; }

      const res = await fetch('/api/student/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          keys: {
            p256dh: btoa(String.fromCharCode(...new Uint8Array(p256dhKey))),
            auth: btoa(String.fromCharCode(...new Uint8Array(authKey))),
          },
        }),
      });
      setStatus(res.ok ? 'enabled' : 'idle');
    } catch {
      setStatus('idle');
    }
  }

  if (status === 'enabled') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
        <BellRing className="h-3.5 w-3.5" />
        Notifications On
      </span>
    );
  }

  if (status === 'denied') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-800">
        <BellOff className="h-3.5 w-3.5" />
        Notifications blocked
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void enable()}
      disabled={status === 'enabling'}
      className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors disabled:opacity-60 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300"
    >
      <Bell className="h-3.5 w-3.5" />
      {status === 'enabling' ? 'Enabling…' : 'Enable Notifications'}
    </button>
  );
}
