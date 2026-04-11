import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

// @ts-ignore
declare const self: ServiceWorkerGlobalScope;

type SWPushEvent = Event & {
  data?: {
    json: () => unknown;
    text: () => string;
  };
  waitUntil: (promise: Promise<unknown>) => void;
};

type SWNotificationClickEvent = Event & {
  notification: Notification & { data?: unknown };
  waitUntil: (promise: Promise<unknown>) => void;
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();

/* Push notifications */
self.addEventListener('push', (event: SWPushEvent) => {
  if (!event.data) return;

  let payload: { title?: string; body?: string; url?: string; icon?: string } = {};
  try {
    payload = event.data.json() as typeof payload;
  } catch {
    payload = { body: event.data.text() };
  }

  const title = payload.title || 'VidyaPath';
  const options: NotificationOptions = {
    body: payload.body || '',
    icon: payload.icon || '/icon.png',
    badge: '/favicon-32.png',
    data: { url: payload.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event: SWNotificationClickEvent) => {
  event.notification.close();
  const url: string = (event.notification.data as Record<string, string>)?.url || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients: Array<{ url: string; focus: () => Promise<unknown> }>) => {
        const existing = clients.find((c) => c.url === url);
        if (existing) return existing.focus();
        return self.clients.openWindow(url);
      })
  );
});
