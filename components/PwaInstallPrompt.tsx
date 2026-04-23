'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Download, PlusSquare, Share2, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const DISMISS_KEY = 'vp-pwa-install-dismissed-at';
const DISMISS_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function recentlyDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  const raw = localStorage.getItem(DISMISS_KEY);
  const timestamp = raw ? Number(raw) : 0;
  return Number.isFinite(timestamp) && timestamp > 0 && Date.now() - timestamp < DISMISS_WINDOW_MS;
}

function markDismissed(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DISMISS_KEY, String(Date.now()));
}

export default function PwaInstallPrompt() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [show, setShow] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIosSafari, setIsIosSafari] = useState(false);

  const isExamMode = pathname.startsWith('/exam/');

  useEffect(() => {
    setMounted(true);
    if (typeof window === 'undefined') return;
    const ua = window.navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(ua);
    const isSafari = /safari/.test(ua) && !/crios|fxios|edgios|opios/.test(ua);
    setIsIosSafari(isIos && isSafari);
  }, []);

  useEffect(() => {
    if (!mounted || isExamMode) return;
    if (isStandaloneMode() || recentlyDismissed()) {
      setShow(false);
      return;
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setShow(true);
    };

    const onInstalled = () => {
      setShow(false);
      setInstallEvent(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);

    // iOS Safari does not fire beforeinstallprompt; show fallback guidance.
    if (isIosSafari && !isStandaloneMode()) {
      setShow(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [isExamMode, isIosSafari, mounted]);

  const title = useMemo(() => {
    if (installEvent) return 'Install VidyaPath App';
    if (isIosSafari) return 'Add VidyaPath to Home Screen';
    return 'Use VidyaPath as an App';
  }, [installEvent, isIosSafari]);

  if (!mounted || !show || isStandaloneMode() || isExamMode) return null;

  const dismiss = () => {
    markDismissed();
    setShow(false);
  };

  const install = async () => {
    if (!installEvent) return;
    try {
      await installEvent.prompt();
      const result = await installEvent.userChoice;
      if (result.outcome === 'accepted') {
        setShow(false);
      } else {
        markDismissed();
        setShow(false);
      }
    } catch {
      markDismissed();
      setShow(false);
    }
  };

  return (
    <div className="md:hidden fixed left-3 right-3 z-[60] bottom-[calc(4.8rem+env(safe-area-inset-bottom))]">
      <div className="rounded-2xl border border-[#E8E4DC] dark:border-gray-700 bg-white/95 dark:bg-gray-900/95 backdrop-blur shadow-lg p-3">
        <div className="flex items-start gap-2">
          <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300">
            {installEvent ? <Download className="h-4 w-4" /> : <PlusSquare className="h-4 w-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-navy-700 dark:text-gray-100">{title}</p>
            {installEvent ? (
              <p className="mt-0.5 text-xs text-[#6A6A84] dark:text-gray-300">
                Faster launch, offline shell caching, and app-like full screen on your phone.
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-[#6A6A84] dark:text-gray-300">
                Tap <Share2 className="inline h-3 w-3 align-[-1px]" /> then choose <span className="font-semibold">Add to Home Screen</span>.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss install prompt"
            className="rounded-lg p-1.5 text-[#8A8AAA] dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {installEvent && (
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={install}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-2"
            >
              <Download className="h-3.5 w-3.5" />
              Install App
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="inline-flex items-center rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-semibold px-3 py-2 text-[#4A4A6A] dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Not now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
