/**
 * Where the product PDFs actually live.
 *
 * On Cloudflare Workers there is no filesystem, so the files are kept in a
 * private R2 bucket (the DOWNLOADS binding in wrangler.jsonc) and streamed by
 * app/api/download once the purchase has been verified.
 *
 * `next dev` runs under Node with no bindings, so it falls back to reading
 * private/downloads/ straight off disk. Same behaviour either way — the point
 * is that neither path is reachable without passing the checks in the download
 * route first.
 *
 * The R2 bucket must stay private. Attaching a public bucket URL to it hands
 * out every product for free and bypasses the paywall entirely.
 */

import type { R2Bucket, ReadableStream as WorkersReadableStream } from '@cloudflare/workers-types';

export type StoredFile = {
  /**
   * R2 hands back a Workers stream; the filesystem fallback hands back bytes.
   * Both are valid BodyInit, and the download route passes either straight
   * through without buffering — a 130 KB PDF should not sit in Worker memory.
   */
  body: WorkersReadableStream | Uint8Array;
  size: number | null;
};

/** Reads the R2 binding, if this is running on Workers with one attached. */
async function downloadsBucket(): Promise<R2Bucket | null> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const context = await getCloudflareContext({ async: true });
    return context.env.DOWNLOADS ?? null;
  } catch {
    // Not running on Workers — `next dev`, `node --test`, CI.
    return null;
  }
}

/**
 * Fetches a product file by name. Returns null when it does not exist, so the
 * caller can distinguish "not entitled" (403) from "we lost the file" (500).
 */
export async function readProductFile(name: string): Promise<StoredFile | null> {
  const bucket = await downloadsBucket();

  if (bucket) {
    const object = await bucket.get(name);
    if (!object) return null;
    return { body: object.body, size: object.size };
  }

  return readFromDisk(name);
}

/** Local development fallback. Never reached on Workers. */
async function readFromDisk(name: string): Promise<StoredFile | null> {
  const [{ readFile }, { join }] = await Promise.all([
    import('node:fs/promises'),
    import('node:path'),
  ]);

  try {
    const bytes = await readFile(join(process.cwd(), 'private', 'downloads', name));
    return { body: new Uint8Array(bytes), size: bytes.byteLength };
  } catch {
    return null;
  }
}

/** Which backing store is in play — surfaced in logs when a file is missing. */
export async function storageBackend(): Promise<'r2' | 'filesystem'> {
  return (await downloadsBucket()) ? 'r2' : 'filesystem';
}

/**
 * Whether a product file is actually present in the active store. Used by the
 * health check to catch "deployed but never uploaded to R2" before a buyer does.
 */
export async function productFileExists(name: string): Promise<boolean> {
  const bucket = await downloadsBucket();

  if (bucket) {
    // head() avoids pulling the body just to answer a yes/no.
    return (await bucket.head(name)) !== null;
  }

  const [{ access }, { join }] = await Promise.all([
    import('node:fs/promises'),
    import('node:path'),
  ]);
  try {
    await access(join(process.cwd(), 'private', 'downloads', name));
    return true;
  } catch {
    return false;
  }
}
