'use client';

import { useState } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function SentryExamplePage() {
  const [result, setResult] = useState<string | null>(null);

  const triggerError = () => {
    try {
      // @ts-expect-error — deliberate test error
      myUndefinedFunction();
    } catch (e) {
      Sentry.captureException(e);
      setResult(`Error captured: ${(e as Error).message}`);
    }
  };

  const triggerApiError = async () => {
    try {
      const res = await fetch('/api/sentry-test');
      const data = await res.json();
      setResult(JSON.stringify(data));
    } catch (e) {
      setResult(`Fetch error: ${(e as Error).message}`);
    }
  };

  return (
    <div style={{ padding: 40, fontFamily: 'system-ui', maxWidth: 600, margin: '0 auto' }}>
      <h1>Sentry Test Page</h1>
      <p>Use this page to verify Sentry error tracking is working.</p>

      <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
        <button
          onClick={triggerError}
          style={{
            padding: '12px 24px',
            background: '#EF4444',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 16,
          }}
        >
          Trigger Client Error
        </button>
        <button
          onClick={triggerApiError}
          style={{
            padding: '12px 24px',
            background: '#3B82F6',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 16,
          }}
        >
          Trigger API Error
        </button>
      </div>

      {result && (
        <pre style={{
          marginTop: 24,
          padding: 16,
          background: '#1F2937',
          color: '#F9FAFB',
          borderRadius: 8,
          overflow: 'auto',
        }}>
          {result}
        </pre>
      )}
    </div>
  );
}
