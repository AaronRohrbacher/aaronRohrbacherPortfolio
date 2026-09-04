/** @type {import('next').NextConfig} */
// Captured at build time (when next.config evaluates during `next build`).
// Used by sitemaps so deploys bump <lastmod> even when no DB content changed.
const BUILD_TIME = new Date().toISOString();

const nextConfig = {
  // Pin both file tracing and Turbopack to this project. Without this Next 16
  // can infer a parent workspace from an unrelated lockfile and browser tests
  // then resolve assets from the wrong root.
  outputFileTracingRoot: import.meta.dirname,
  turbopack: { root: import.meta.dirname },
  env: {
    BUILD_TIME,
  },

  // Allow Next.js to process the png assets inside @codinix/device-mockup
  transpilePackages: ['@codinix/device-mockup'],

  // Allow LAN-IP access to the dev server (phones, other devices on the network).
  // Without this, Next 16 blocks cross-origin requests for _next/* chunks,
  // which breaks client hydration (PageTransition stays at opacity:0).
  // Note: Next.js allowedDevOrigins takes glob patterns, NOT CIDR — `10.1.1.0/24`
  // is interpreted as a literal string and never matches.
  allowedDevOrigins: [
    'localhost', '*.localhost',
    '10.1.1.*', '10.1.*.*', '192.168.*.*', '*.local',
  ],



  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
        ],
      },
    ];
  },
};

export default nextConfig;
