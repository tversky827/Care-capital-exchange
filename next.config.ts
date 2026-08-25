import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // This repository documents itself in README.md; no generated agent files.
  agentRules: false,
  serverExternalPackages: [],
  experimental: {
    // Uploaded documents can be large; allow generous server action payloads.
    // Kept in step with MAX_UPLOAD_MB so the framework limit and the product's
    // own limit cannot disagree. A host with a smaller ceiling of its own
    // (Vercel rejects bodies over 4.5MB) still wins — set MAX_UPLOAD_MB to match.
    serverActions: { bodySizeLimit: `${Number(process.env.MAX_UPLOAD_MB || 25)}mb` as `${number}mb` },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
}

export default nextConfig
