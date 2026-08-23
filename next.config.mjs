/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The PDFs live outside public/ and are streamed by app/api/download only
  // after the purchase is verified against Stripe, so bundle them with the
  // serverless function rather than the static output.
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
