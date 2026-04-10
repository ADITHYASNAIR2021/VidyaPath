import type { ObservabilityAlert, ObservabilitySummary } from '@/lib/observability-summary';
import { logServerEvent } from '@/lib/observability';

export interface ObservabilityDispatchResult {
  delivered: boolean;
  skippedReason?: 'no-alerts' | 'webhook-not-configured';
  triggeredAlerts: ObservabilityAlert[];
  destination?: string;
  responseStatus?: number;
}

function buildWebhookPayload(summary: ObservabilitySummary, triggeredAlerts: ObservabilityAlert[]) {
  return {
    event: 'vidyapath-observability-alert',
    generatedAt: summary.generatedAt,
    windowHours: summary.windowHours,
    counters: summary.counters,
    alerts: triggeredAlerts.map((alert) => ({
      code: alert.code,
      severity: alert.severity,
      status: alert.status,
      message: alert.message,
      metric: alert.metric,
      threshold: alert.threshold,
    })),
  };
}

export async function dispatchObservabilityAlerts(summary: ObservabilitySummary): Promise<ObservabilityDispatchResult> {
  const triggeredAlerts = summary.alerts.filter((alert) => alert.status === 'warn' || alert.status === 'critical');
  if (triggeredAlerts.length === 0) {
    return {
      delivered: false,
      skippedReason: 'no-alerts',
      triggeredAlerts,
    };
  }

  const webhookUrl = (process.env.OBSERVABILITY_ALERT_WEBHOOK_URL || '').trim();
  if (!webhookUrl) {
    return {
      delivered: false,
      skippedReason: 'webhook-not-configured',
      triggeredAlerts,
    };
  }

  const payload = buildWebhookPayload(summary, triggeredAlerts);
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    logServerEvent({
      level: 'error',
      event: 'observability-alert-dispatch-failed',
      endpoint: webhookUrl,
      statusCode: response.status,
      details: { body: text.slice(0, 300), triggeredAlerts: triggeredAlerts.length },
    });
    throw new Error(`Alert webhook failed with ${response.status}`);
  }

  logServerEvent({
    event: 'observability-alert-dispatched',
    endpoint: webhookUrl,
    statusCode: response.status,
    details: { triggeredAlerts: triggeredAlerts.length },
  });

  return {
    delivered: true,
    triggeredAlerts,
    destination: webhookUrl,
    responseStatus: response.status,
  };
}
