/**
 * Process-wide runtime state.
 *
 * Next.js may load a module once per route bundle, which would give every API route
 * its own copy of in-memory counters. Anything that must be shared across routes in
 * one server process (rate-limit buckets, AI budget, model circuit breaker, usage
 * metrics) lives on globalThis under a single key instead of in module scope.
 */
type SharedState = Record<string, unknown>;

const GLOBAL_KEY = '__vidyapathRuntimeState__';

function root(): SharedState {
  const holder = globalThis as unknown as Record<string, SharedState | undefined>;
  if (!holder[GLOBAL_KEY]) holder[GLOBAL_KEY] = {};
  return holder[GLOBAL_KEY] as SharedState;
}

/** Returns the shared value for `key`, creating it with `init` on first use. */
export function sharedState<T>(key: string, init: () => T): T {
  const state = root();
  if (!(key in state)) state[key] = init();
  return state[key] as T;
}
