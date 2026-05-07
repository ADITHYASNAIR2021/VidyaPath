'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { trackAnalyticsEvent } from '@/lib/client-analytics';

function normalizeRoute(pathname: string): string {
  return pathname.split('?')[0].trim().slice(0, 180) || '/';
}

function getEndpointFromFetchInput(input: RequestInfo | URL): string | null {
  const rawUrl =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input instanceof Request
          ? input.url
          : '';
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl, window.location.origin);
    if (!parsed.pathname.startsWith('/api/')) return null;
    return parsed.pathname;
  } catch {
    return null;
  }
}

function bucketMs(value: number): string {
  if (value < 300) return '<300ms';
  if (value < 800) return '300-800ms';
  if (value < 1500) return '800-1500ms';
  if (value < 3000) return '1500-3000ms';
  return '3000ms+';
}

function shouldSampleApiRequestTelemetry(): boolean {
  return Math.random() < 0.35;
}

export default function UxTelemetry() {
  const pathname = usePathname();
  const lastRouteRef = useRef<string>('');
  const routeEnterAtRef = useRef<number>(0);
  const activeRouteRef = useRef<string>('');

  useEffect(() => {
    activeRouteRef.current = normalizeRoute(pathname || '/');
  }, [pathname]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const originalFetch = window.fetch.bind(window);
    const instrumentedFetch: typeof window.fetch = async (input, init) => {
      const endpoint = getEndpointFromFetchInput(input);
      const method = ((init?.method || (input instanceof Request ? input.method : 'GET')) || 'GET').toUpperCase();
      if (endpoint && endpoint !== '/api/analytics/track' && shouldSampleApiRequestTelemetry()) {
        trackAnalyticsEvent({
          eventName: 'ux_api_request',
          metadata: {
            endpoint,
            method,
            route: activeRouteRef.current,
            sampled: true,
          },
        });
      }
      try {
        const response = await originalFetch(input, init);
        if (endpoint && endpoint !== '/api/analytics/track' && !response.ok) {
          trackAnalyticsEvent({
            eventName: 'ux_api_error',
            metadata: {
              endpoint,
              method,
              statusCode: response.status,
              route: activeRouteRef.current,
            },
          });
        }
        return response;
      } catch (error) {
        if (endpoint && endpoint !== '/api/analytics/track') {
          trackAnalyticsEvent({
            eventName: 'ux_api_error',
            metadata: {
              endpoint,
              method,
              statusCode: 0,
              route: activeRouteRef.current,
              errorType: error instanceof Error ? error.name : 'network',
            },
          });
        }
        throw error;
      }
    };

    window.fetch = instrumentedFetch;
    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  useEffect(() => {
    if (!pathname || typeof window === 'undefined') return;

    const route = normalizeRoute(pathname);
    const now = performance.now();

    if (lastRouteRef.current) {
      const dwellMs = Math.max(0, Math.round(now - routeEnterAtRef.current));
      trackAnalyticsEvent({
        eventName: 'ux_route_dropoff',
        metadata: {
          route: lastRouteRef.current,
          dwellMs,
          dropped: dwellMs < 8000,
          dwellBucket: bucketMs(dwellMs),
        },
      });
    }

    lastRouteRef.current = route;
    routeEnterAtRef.current = now;
    activeRouteRef.current = route;

    const start = performance.now();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const renderMs = Math.max(0, Math.round(performance.now() - start));
        trackAnalyticsEvent({
          eventName: 'ux_page_load',
          metadata: {
            route,
            renderMs,
            renderBucket: bucketMs(renderMs),
          },
        });
      });
    });
  }, [pathname]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleUnload = () => {
      const route = lastRouteRef.current || activeRouteRef.current || '/';
      const dwellMs = routeEnterAtRef.current > 0 ? Math.max(0, Math.round(performance.now() - routeEnterAtRef.current)) : 0;
      trackAnalyticsEvent({
        eventName: 'ux_route_dropoff',
        metadata: {
          route,
          dwellMs,
          dropped: dwellMs < 8000,
          dwellBucket: bucketMs(dwellMs),
          unload: true,
        },
      });
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);

  return null;
}
