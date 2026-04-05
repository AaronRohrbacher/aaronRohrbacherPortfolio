/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow Next.js to process the png assets inside @codinix/device-mockup
  transpilePackages: ['@codinix/device-mockup'],

  // Allow LAN-IP access to the dev server (phones, other devices on the network).
  // Without this, Next 16 blocks cross-origin requests for _next/* chunks,
  // which breaks client hydration (PageTransition stays at opacity:0).
  allowedDevOrigins: ['10.1.1.143', '10.1.1.0/24', '192.168.0.0/16'],


  // Required for SharedArrayBuffer — needed by ONNX Runtime WASM (Transformers.js)
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
