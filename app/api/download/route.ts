import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { verifyDownloadToken, isSafeFileName } from '@/lib/download-token';
import { entitlementsFor, isPaid } from '@/lib/entitlements';
import { readProductFile, storageBackend } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const deny = (message: string, status: number) =>
  new NextResponse(message, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });

/**
 * Streams a purchased PDF.
 *
 * Three gates, all of which must pass:
 *   1. the link carries a valid, unexpired HMAC signature
 *   2. Stripe still reports the referenced session as paid
 *   3. that session's entitlements actually include the requested file
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  if (!token) return deny('Missing download token.', 400);

  const verified = verifyDownloadToken(token);
  if (!verified.ok) {
    return verified.reason === 'expired'
      ? deny('This download link has expired. Request a fresh one from the receipt page.', 410)
      : deny('This download link is not valid.', 403);
  }

  const { sessionId, file } = verified.claim;
  if (!isSafeFileName(file)) return deny('This download link is not valid.', 403);

  let session;
  try {
    session = await stripe().checkout.sessions.retrieve(sessionId, {
      expand: ['line_items.data.price.product'],
    });
  } catch {
    return deny('Could not verify this purchase.', 403);
  }

  if (!isPaid(session)) return deny('This order has not been paid.', 403);

  const permitted = entitlementsFor(session).some((e) => e.files.some((f) => f.name === file));
  if (!permitted) return deny('This order does not include that file.', 403);

  const stored = await readProductFile(file);
  if (!stored) {
    // Entitled but absent: the buyer paid, so this is our problem, not theirs.
    console.error(
      `[download] entitled file is missing from ${await storageBackend()}: ${file} ` +
        `(session ${sessionId}) — re-run \`npm run pdf:build && npm run pdf:upload\``,
    );
    return deny('That file is not available right now. Please contact support.', 500);
  }

  const headers: Record<string, string> = {
    'content-type': 'application/pdf',
    'content-disposition': `attachment; filename="${file}"`,
    'cache-control': 'private, no-store',
  };
  if (stored.size !== null) headers['content-length'] = String(stored.size);

  return new NextResponse(stored.body as BodyInit, { status: 200, headers });
}
