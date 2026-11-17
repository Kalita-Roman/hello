const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync, sign } = require('node:crypto');
const { OAuth2Client } = require('google-auth-library');
const { createServer } = require('./server');

const audience = '/projects/201316386962/locations/europe-central2/services/hello-git';
const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

function makeToken(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: 'test-key' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: 'https://cloud.google.com/iap', aud: audience,
    iat: now - 5, exp: now + 600,
    sub: 'accounts.google.com:123', email: 'visitor@example.com',
    ...overrides,
  })).toString('base64url');
  const input = `${header}.${payload}`;
  const signature = sign('sha256', Buffer.from(input), {
    key: privateKey, dsaEncoding: 'ieee-p1363',
  }).toString('base64url');
  return `${input}.${signature}`;
}

test('greeting uses only a valid signed identity for this service', async (t) => {
  const authClient = new OAuth2Client();
  authClient.getIapPublicKeys = async () => ({
    pubkeys: { 'test-key': publicKey.export({ type: 'spki', format: 'pem' }) },
  });
  const server = createServer({ authClient, audience });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;

  await t.test('verified visitor receives a personalized private response', async () => {
    const response = await fetch(url, {
      headers: { 'x-goog-iap-jwt-assertion': makeToken() },
    });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'Hello, visitor@example.com!\n');
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.match(response.headers.get('content-type'), /^text\/plain/);
  });

  await t.test('unsigned identity headers alone cannot impersonate a visitor', async () => {
    const response = await fetch(url, {
      headers: { 'x-goog-authenticated-user-email': 'accounts.google.com:owner@example.com' },
    });
    assert.equal(response.status, 401);
    assert.doesNotMatch(await response.text(), /owner@example.com/);
  });

  const now = Math.floor(Date.now() / 1000);
  const invalidTokens = {
    'wrong audience': makeToken({ aud: '/projects/another/service' }),
    'wrong issuer': makeToken({ iss: 'https://attacker.example' }),
    'expired token': makeToken({ iat: now - 1200, exp: now - 600 }),
    'future token': makeToken({ iat: now + 600, exp: now + 1200 }),
    'missing email': makeToken({ email: undefined }),
    'missing subject': makeToken({ sub: undefined }),
    'malformed token': 'not-a-jwt',
  };
  const segments = makeToken().split('.');
  segments[1] = Buffer.from(JSON.stringify({ email: 'owner@example.com' })).toString('base64url');
  invalidTokens['tampered payload'] = segments.join('.');

  for (const [name, token] of Object.entries(invalidTokens)) {
    await t.test(`rejects ${name}`, async () => {
      const response = await fetch(url, { headers: { 'x-goog-iap-jwt-assertion': token } });
      assert.equal(response.status, 403);
      assert.equal(await response.text(), 'Unable to verify your IAP identity.\n');
    });
  }
});
