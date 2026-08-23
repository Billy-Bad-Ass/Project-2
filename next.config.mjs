/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // On Cloudflare the PDFs live in the DOWNLOADS R2 bucket, not on disk — see
  // lib/storage.ts. This tracing rule only matters for a Node deploy target
  // (Vercel, a container), where the filesystem fallback is the live path.
  outputFileTracingIncludes: {
    '/api/download': ['./private/downloads/**'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

export default nextConfig;
