#!/usr/bin/env node

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:3000';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function unwrapApiPayload(json) {
  if (json && typeof json === 'object' && 'data' in json) {
    return json.data;
  }
  return json;
}

function extractCookieHeader(response) {
  const headerBag = response.headers;
  const setCookies = typeof headerBag.getSetCookie === 'function'
    ? headerBag.getSetCookie()
    : [];
  if (!Array.isArray(setCookies) || setCookies.length === 0) return '';
  return setCookies
    .map((entry) => String(entry).split(';')[0]?.trim())
    .filter(Boolean)
    .join('; ');
}

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    redirect: 'manual',
    ...init,
  });
  const text = await response.text();
  const json = parseJsonSafe(text);
  return { response, text, json };
}

async function runCheck(name, fn) {
  try {
    await fn();
    console.log(`PASS: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name}`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

function expectStatus(actual, expected, label) {
  const accepted = Array.isArray(expected) ? expected : [expected];
  assert(accepted.includes(actual), `${label} expected ${accepted.join('/')} but got ${actual}`);
}

async function unauthMatrixChecks() {
  await runCheck('admin page redirects without auth', async () => {
    const { response } = await request('/admin');
    expectStatus(response.status, [301, 302, 303, 307, 308], 'admin redirect');
  });

  await runCheck('teacher page redirects without auth', async () => {
    const { response } = await request('/teacher');
    expectStatus(response.status, [301, 302, 303, 307, 308], 'teacher redirect');
  });

  await runCheck('student page redirects without auth', async () => {
    const { response } = await request('/student');
    expectStatus(response.status, [301, 302, 303, 307, 308], 'student redirect');
  });

  await runCheck('developer API denies without developer session', async () => {
    const { response } = await request('/api/developer/schools');
    expectStatus(response.status, 401, 'developer API without auth');
  });

  await runCheck('admin API denies without admin session', async () => {
    const { response } = await request('/api/admin/overview');
    expectStatus(response.status, 401, 'admin API without auth');
  });

  await runCheck('teacher publish API denies without teacher session', async () => {
    const { response } = await request('/api/teacher/assignment-pack/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packId: 'dummy-pack-id' }),
    });
    expectStatus(response.status, 401, 'teacher publish without auth');
  });

  await runCheck('exam submit API denies without student session', async () => {
    const { response } = await request('/api/exam/session/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'dummy-session-id', answers: [] }),
    });
    expectStatus(response.status, 401, 'exam submit without auth');
  });
}

async function verifyCookieRoleIsolation(input) {
  const { role, cookie, mePath, denyChecks } = input;
  if (!cookie) return;

  await runCheck(`${role} cookie resolves its own session`, async () => {
    const { response, json } = await request(mePath, {
      headers: { cookie },
    });
    expectStatus(response.status, 200, `${role} session me`);
    const payload = unwrapApiPayload(json);
    assert(payload && typeof payload === 'object', `${role} me payload missing`);
  });

  for (const deny of denyChecks) {
    await runCheck(`${role} cookie denied on ${deny.path}`, async () => {
      const { response } = await request(deny.path, {
        method: deny.method || 'GET',
        headers: {
          ...(deny.body ? { 'Content-Type': 'application/json' } : {}),
          cookie,
        },
        ...(deny.body ? { body: JSON.stringify(deny.body) } : {}),
      });
      expectStatus(response.status, [401, 403], `${role} denied ${deny.path}`);
    });
  }
}

async function loginFlowChecks() {
  const studentRoll = process.env.AUTH_SUITE_STUDENT_ROLL || '';
  const studentPin = process.env.AUTH_SUITE_STUDENT_PIN || '';
  if (studentRoll && studentPin) {
    await runCheck('student login + session flow', async () => {
      const { response, json } = await request('/api/student/session/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roll: studentRoll,
          pin: studentPin,
          schoolCode: process.env.AUTH_SUITE_STUDENT_SCHOOL_CODE || undefined,
          classLevel: process.env.AUTH_SUITE_STUDENT_CLASS_LEVEL ? Number(process.env.AUTH_SUITE_STUDENT_CLASS_LEVEL) : undefined,
          section: process.env.AUTH_SUITE_STUDENT_SECTION || undefined,
        }),
      });
      expectStatus(response.status, 200, 'student login');
      const payload = unwrapApiPayload(json);
      assert(payload?.role === 'student', 'student role missing in login payload');
      const cookie = extractCookieHeader(response);
      assert(cookie.length > 0, 'student login cookie missing');

      const me = await request('/api/student/session/me', {
        headers: { cookie },
      });
      expectStatus(me.response.status, 200, 'student me after login');

      const cross = await request('/api/teacher/session/me', {
        headers: { cookie },
      });
      expectStatus(cross.response.status, [401, 403], 'student cookie should not access teacher me');
    });
  } else {
    console.log('SKIP: student login flow (missing AUTH_SUITE_STUDENT_ROLL/AUTH_SUITE_STUDENT_PIN)');
  }

  const teacherIdentifier = process.env.AUTH_SUITE_TEACHER_IDENTIFIER || '';
  const teacherPassword = process.env.AUTH_SUITE_TEACHER_PASSWORD || process.env.AUTH_SUITE_TEACHER_PIN || '';
  if (teacherIdentifier && teacherPassword) {
    await runCheck('teacher login + session flow', async () => {
      const { response, json } = await request('/api/teacher/session/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: teacherIdentifier,
          password: teacherPassword,
          schoolCode: process.env.AUTH_SUITE_TEACHER_SCHOOL_CODE || undefined,
        }),
      });
      expectStatus(response.status, 200, 'teacher login');
      const payload = unwrapApiPayload(json);
      assert(payload?.role === 'teacher', 'teacher role missing in login payload');
      const cookie = extractCookieHeader(response);
      assert(cookie.length > 0, 'teacher login cookie missing');

      const me = await request('/api/teacher/session/me', {
        headers: { cookie },
      });
      expectStatus(me.response.status, 200, 'teacher me after login');

      const cross = await request('/api/developer/schools', {
        headers: { cookie },
      });
      expectStatus(cross.response.status, [401, 403], 'teacher cookie should not access developer API');
    });
  } else {
    console.log('SKIP: teacher login flow (missing AUTH_SUITE_TEACHER_IDENTIFIER/AUTH_SUITE_TEACHER_PASSWORD)');
  }
}

await unauthMatrixChecks();

await verifyCookieRoleIsolation({
  role: 'student',
  cookie: process.env.AUTH_SUITE_STUDENT_COOKIE || '',
  mePath: '/api/student/session/me',
  denyChecks: [
    {
      path: '/api/teacher/assignment-pack/publish',
      method: 'POST',
      body: { packId: 'dummy-pack-id' },
    },
    { path: '/api/developer/schools' },
  ],
});

await verifyCookieRoleIsolation({
  role: 'teacher',
  cookie: process.env.AUTH_SUITE_TEACHER_COOKIE || '',
  mePath: '/api/teacher/session/me',
  denyChecks: [
    { path: '/api/developer/schools' },
    {
      path: '/api/exam/session/submit',
      method: 'POST',
      body: { sessionId: 'dummy-session-id', answers: [] },
    },
  ],
});

await verifyCookieRoleIsolation({
  role: 'admin',
  cookie: process.env.AUTH_SUITE_ADMIN_COOKIE || '',
  mePath: '/api/admin/session/me',
  denyChecks: [
    { path: '/api/developer/schools' },
    {
      path: '/api/teacher/assignment-pack/publish',
      method: 'POST',
      body: { packId: 'dummy-pack-id' },
    },
  ],
});

await verifyCookieRoleIsolation({
  role: 'developer',
  cookie: process.env.AUTH_SUITE_DEVELOPER_COOKIE || '',
  mePath: '/api/auth/session',
  denyChecks: [
    {
      path: '/api/exam/session/submit',
      method: 'POST',
      body: { sessionId: 'dummy-session-id', answers: [] },
    },
    {
      path: '/api/teacher/assignment-pack/publish',
      method: 'POST',
      body: { packId: 'dummy-pack-id' },
    },
  ],
});

await loginFlowChecks();

if (process.exitCode) {
  process.exit(process.exitCode);
}

