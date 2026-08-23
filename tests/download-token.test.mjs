import { test, before } from 'node:test';
import assert from 'node:assert/strict';

process.env.DOWNLOAD_SIGNING_SECRET ??= 'test-only-signing-secret-of-sufficient-length';

let mod;
before(async () => {
  mod = await import('../lib/download-token.ts');
});

test('a freshly minted token verifies and round-trips its claim', () => {
  const token = mod.createDownloadToken({ sessionId: 'cs_test_123', file: 'guide-A4.pdf' });
  const result = mod.verifyDownloadToken(token);

  assert.equal(result.ok, true);
  assert.equal(result.claim.sessionId, 'cs_test_123');
  assert.equal(result.claim.file, 'guide-A4.pdf');
  assert.ok(result.claim.exp > Math.floor(Date.now() / 1000));
});

test('a tampered payload is rejected', () => {
  const token = mod.createDownloadToken({ sessionId: 'cs_test_123', file: 'cheap-A4.pdf' });
  const [, signature] = token.split('.');

  const forged = Buffer.from(
    JSON.stringify({ sessionId: 'cs_test_123', file: 'bundle-A4.pdf', exp: 9999999999 }),
  ).toString('base64url');

  const result = mod.verifyDownloadToken(`${forged}.${signature}`);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'bad-signature');
});

test('a tampered signature is rejected', () => {
  const token = mod.createDownloadToken({ sessionId: 'cs_test_123', file: 'guide-A4.pdf' });
  const [payload] = token.split('.');
  const result = mod.verifyDownloadToken(`${payload}.not-the-real-signature`);

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'bad-signature');
});

test('an expired token is rejected even though the signature is good', () => {
  const token = mod.createDownloadToken({ sessionId: 'cs_test_123', file: 'guide-A4.pdf' }, -60);
  const result = mod.verifyDownloadToken(token);

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'expired');
});

test('malformed tokens are rejected rather than throwing', () => {
  for (const bad of ['', 'nodot', 'a.b.c', '.', '!!!.???']) {
    const result = mod.verifyDownloadToken(bad);
    assert.equal(result.ok, false, `expected ${JSON.stringify(bad)} to be rejected`);
  }
});

test('isSafeFileName accepts catalog file names and rejects traversal', () => {
  assert.equal(mod.isSafeFileName('espresso-dial-in-card-A4.pdf'), true);
  assert.equal(mod.isSafeFileName('keyboard-sound-mod-chart-Letter.pdf'), true);

  for (const bad of [
    '../../etc/passwd',
    '../secrets.pdf',
    '/etc/passwd.pdf',
    'guide.pdf.exe',
    'guide.txt',
    '.hidden.pdf',
    'a/b.pdf',
  ]) {
    assert.equal(mod.isSafeFileName(bad), false, `expected ${bad} to be rejected`);
  }
});
