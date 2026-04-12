/** @type {import('next').NextConfig} */
function validateBuildEnv() {
  const strictValidation = process.env.STRICT_ENV_VALIDATION === '1';
  if (!strictValidation) return;
  const hasValue = (name) => !!(process.env[name] || '').trim();
  const missing = [];
  if (!hasValue('NEXT_PUBLIC_SUPABASE_URL')) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!(hasValue('NEXT_PUBLIC_SUPABASE_ANON_KEY') || hasValue('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY'))) {
    missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY|NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY');
  }
  if (!hasValue('SESSION_SIGNING_SECRET')) missing.push('SESSION_SIGNING_SECRET');
  if (missing.length > 0) {
    throw new Error(`Missing required production env vars: ${missing.join(', ')}`);
  }
}

validateBuildEnv();

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self' https://*.supabase.co https://api.groq.com https://generativelanguage.googleapis.com https://huggingface.co",
  'upgrade-insecure-requests',
].join('; ');

const nextConfig = {
  images: {
    domains: ['ncert.nic.in', 'cbseacademic.nic.in'],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Content-Security-Policy', value: csp.replace(/\n/g, '') },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
        ],
      },
      {
        // Cache static chapter pages aggressively at CDN
        source: '/chapters/:id',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' },
        ],
      },
    ];
  },
};

const withSerwist = require('@serwist/next').default({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
});

module.exports = withSerwist(nextConfig);
