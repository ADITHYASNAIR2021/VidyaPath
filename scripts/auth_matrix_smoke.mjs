#!/usr/bin/env node

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:3000';

async function check(name, fn) {
  try {
    await fn();
    console.log(`PASS: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name}`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function fetchNoRedirect(path, init) {
  return fetch(`${baseUrl}${path}`, {
    redirect: 'manual',
    ...init,
  });
}

await check('admin page redirects without auth', async () => {
  const response = await fetchNoRedirect('/admin');
  assert([301, 302, 303, 307, 308].includes(response.status), `Expected redirect, got ${response.status}`);
});

await check('teacher page redirects without auth', async () => {
  const response = await fetchNoRedirect('/teacher');
  assert([301, 302, 303, 307, 308].includes(response.status), `Expected redirect, got ${response.status}`);
});

await check('developer API denies without developer session', async () => {
  const response = await fetchNoRedirect('/api/developer/schools');
  assert(response.status === 401, `Expected 401, got ${response.status}`);
});

await check('teacher publish API denies without teacher session', async () => {
  const response = await fetchNoRedirect('/api/teacher/assignment-pack/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ packId: 'dummy-pack-id' }),
  });
  assert(response.status === 401, `Expected 401, got ${response.status}`);
});

await check('exam submit API denies without student session', async () => {
  const response = await fetchNoRedirect('/api/exam/session/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: 'dummy-session-id', answers: [] }),
  });
  assert(response.status === 401, `Expected 401, got ${response.status}`);
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
