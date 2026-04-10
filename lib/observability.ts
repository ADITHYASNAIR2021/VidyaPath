type LogLevel = 'info' | 'warn' | 'error';

export function logServerEvent(input: {
  level?: LogLevel;
  event: string;
  requestId?: string;
  endpoint?: string;
  role?: string;
  schoolId?: string;
  statusCode?: number;
  details?: Record<string, unknown>;
}): void {
  const payload = {
    ts: new Date().toISOString(),
    level: input.level || 'info',
    event: input.event,
    requestId: input.requestId,
    endpoint: input.endpoint,
    role: input.role,
    schoolId: input.schoolId,
    statusCode: input.statusCode,
    details: input.details || {},
  };
  const serialized = JSON.stringify(payload);
  if (payload.level === 'error') {
    console.error(serialized);
    return;
  }
  if (payload.level === 'warn') {
    console.warn(serialized);
    return;
  }
  console.log(serialized);
}
