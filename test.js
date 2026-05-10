/**
 * Smoke test — run with: node test.js
 * Requires the server to be running on PORT 3001
 */

const BASE = 'http://localhost:3001';
const email = `test_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
const password = 'SuperSecret99';

let accessToken, refreshToken, apiKey;

async function req(method, path, body, headers = {}) {
  const reqHeaders = { ...headers };
  if (body) {
    reqHeaders['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: reqHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { status: res.status, data };
}

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ ${label}`);
  } else {
    console.error(`  ❌ ${label}`, detail);
    process.exitCode = 1;
  }
}

(async () => {
  console.log('\n🔧 Auth Service Smoke Test\n');

  // Health
  console.log('── Health');
  const health = await req('GET', '/health');
  assert('GET /health → 200', health.status === 200);

  // Register
  console.log('── Register');
  const reg = await req('POST', '/auth/register', { email, password });
  assert('POST /auth/register → 201', reg.status === 201);
  assert('Returns user.id', !!reg.data.user?.id);

  // Duplicate register
  const dup = await req('POST', '/auth/register', { email, password });
  assert('Duplicate email → 409', dup.status === 409);

  // Login
  console.log('── Login');
  const login = await req('POST', '/auth/login', { email, password });
  assert('POST /auth/login → 200', login.status === 200);
  assert('Returns access_token', !!login.data.access_token);
  assert('Returns refresh_token', !!login.data.refresh_token);
  accessToken = login.data.access_token;
  refreshToken = login.data.refresh_token;

  // Me
  console.log('── Protected /me');
  const me = await req('GET', '/auth/me', null, { Authorization: `Bearer ${accessToken}` });
  assert('GET /auth/me → 200', me.status === 200);
  assert('Returns correct email', me.data.user.email === email.toLowerCase());

  // Refresh
  console.log('── Refresh');
  const refresh = await req('POST', '/auth/refresh', { refresh_token: refreshToken });
  assert('POST /auth/refresh → 200', refresh.status === 200);
  assert('Returns new access_token', !!refresh.data.access_token);
  refreshToken = refresh.data.refresh_token;
  accessToken = refresh.data.access_token;

  // API Key
  console.log('── API Keys');
  const createKey = await req('POST', '/auth/api-keys', { name: 'test-key' }, {
    Authorization: `Bearer ${accessToken}`,
  });
  assert('POST /auth/api-keys → 201', createKey.status === 201);
  assert('Returns api_key', !!createKey.data.api_key);
  apiKey = createKey.data.api_key;
  const keyId = createKey.data.id;

  // Use API key to access /me
  const meViaKey = await req('GET', '/auth/me', null, { 'x-api-key': apiKey });
  assert('GET /auth/me via API key → 200', meViaKey.status === 200);

  // Revoke API key
  console.log('── Revoke API Key');
  const revoke = await req('DELETE', `/auth/api-keys/${keyId}`, null, {
    Authorization: `Bearer ${accessToken}`,
  });
  assert('DELETE /auth/api-keys/:id → 200', revoke.status === 200);

  // Revoked key should fail
  const meRevoked = await req('GET', '/auth/me', null, { 'x-api-key': apiKey });
  assert('Revoked API key → 401', meRevoked.status === 401);

  // Logout (use fresh login since refresh was rotated)
  console.log('── Logout');
  const login2 = await req('POST', '/auth/login', { email, password });
  const logout = await req('POST', '/auth/logout', { refresh_token: login2.data.refresh_token });
  assert('POST /auth/logout → 200', logout.status === 200);

  // Old refresh token should fail (the one we used in /refresh is now rotated)
  const badRefresh = await req('POST', '/auth/refresh', { refresh_token: login2.data.refresh_token });
  assert('Used refresh token after logout → 401', badRefresh.status === 401);

  console.log('\n── Done\n');
})();
