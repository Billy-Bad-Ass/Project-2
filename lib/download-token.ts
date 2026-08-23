import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

/**
 * Signed, expiring download links.
 *
 * There is no orders database: a link is only ever minted after Stripe has
 * confirmed the session is paid, and the download route re-checks that with
 * Stripe before streaming a byte. The signature stops anyone editing the sku
 * or the expiry; the expiry stops a leaked link living forever.
 */

export const DEFAULT_TTL_SECONDS = 72 * 60 * 60; // 72 hours

export type DownloadClaim = {
  sessionId: string;
  file: string;
  exp: number;
};

function secret(): string {
  const value = process.env.DOWNLOAD_SIGNING_SECRET;
  if (!value || value.length < 32) {
    throw new Error(
      'DOWNLOAD_SIGNING_SECRET must be set to at least 32 characters. ' +
        'Generate one with: openssl rand -base64 32',
    );
  }
  return value;
}

const b64url = (buf: Buffer) => buf.toString('base64url');

function sign(payload: string): string {
  return b64url(createHmac('sha256', secret()).update(payload).digest());
}

export function createDownloadToken(
  claim: Omit<DownloadClaim, 'exp'>,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): string {
  const full: DownloadClaim = {
    ...claim,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const payload = b64url(Buffer.from(JSON.stringify(full)));
  return `${payload}.${sign(payload)}`;
}

export type VerifyResult =
  | { ok: true; claim: DownloadClaim }
  | { ok: false; reason: 'malformed' | 'bad-signature' | 'expired' };

export function verifyDownloadToken(token: string): VerifyResult {
  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, reason: 'malformed' };

  const [payload, signature] = parts;
  const expected = sign(payload);

  // Compare as fixed-length buffers so the check is constant time.
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad-signature' };
  }

  let claim: DownloadClaim;
  try {
    claim = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  if (typeof claim.exp !== 'number' || claim.exp * 1000 < Date.now()) {
    return { ok: false, reason: 'expired' };
  }
  if (typeof claim.sessionId !== 'string' || typeof claim.file !== 'string') {
    return { ok: false, reason: 'malformed' };
  }

  return { ok: true, claim };
}

/** Only ever serve a file the catalog knows about, by exact name. */
export function isSafeFileName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*\.pdf$/.test(name) && !name.includes('..');
}

export const generateSecret = () => randomBytes(32).toString('base64');
