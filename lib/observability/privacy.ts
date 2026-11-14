/** Shared browser/edge/server telemetry filter. Preserve diagnostics, discard student payloads. */
export function redactTelemetryEvent<T extends { request?: { data?: unknown; cookies?: unknown; headers?: Record<string, string>; url?: string }; user?: unknown; extra?: unknown; breadcrumbs?: unknown }>(event: T): T {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.headers;
    if (event.request.url) {
      try { const url = new URL(event.request.url); url.search = ''; url.hash = ''; event.request.url = url.toString(); } catch { delete event.request.url; }
    }
  }
  delete event.user;
  delete event.extra;
  delete event.breadcrumbs;
  return event;
}

export function redactSpanData<T extends { data?: Record<string, unknown> }>(span: T): T {
  if (span.data) {
    for (const key of Object.keys(span.data)) {
      if (/input|output|prompt|messages|body|headers|cookie|authorization|image|answer|query/i.test(key)) delete span.data[key];
      else if (typeof span.data[key] === 'string' && /https?:\/\//.test(span.data[key] as string)) {
        try { const url = new URL(span.data[key] as string); url.search = ''; url.hash = ''; span.data[key] = url.toString(); } catch { delete span.data[key]; }
      }
    }
  }
  return span;
}
