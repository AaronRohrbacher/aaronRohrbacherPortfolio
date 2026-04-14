/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow Next.js to process the png assets inside @codinix/device-mockup
  transpilePackages: ['@codinix/device-mockup'],

  // Allow LAN-IP access to the dev server (phones, other devices on the network).
  // Without this, Next 16 blocks cross-origin requests for _next/* chunks,
  // which breaks client hydration (PageTransition stays at opacity:0).
  // Note: Next.js allowedDevOrigins takes glob patterns, NOT CIDR — `10.1.1.0/24`
  // is interpreted as a literal string and never matches.
  allowedDevOrigins: ['10.1.1.*', '10.1.*.*', '192.168.*.*', '*.local'],



  // AI agent disabled — see AI_COMMENTED_OUT.md at repo root.
  // COOP/COEP headers below were required for SharedArrayBuffer (ONNX/Transformers.js).
  // They block Amazon Connect's cross-origin subresources from loading, so they're
  // commented out while AI is disabled. Restore if re-enabling Transformers.js.
  // async headers() {
  //   return [
  //     {
  //       source: '/(.*)',
  //       headers: [
  //         { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  //         { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
  //       ],
  //     },
  //   ];
  // },
};

export default nextConfig;
