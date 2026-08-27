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
  if (!hasValue('SUPABASE_SERVICE_ROLE_KEY')) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!hasValue('SESSION_SIGNING_SECRET')) {
    missing.push('SESSION_SIGNING_SECRET');
  } else if (process.env.SESSION_SIGNING_SECRET.trim().length < 32) {
    missing.push('SESSION_SIGNING_SECRET (minimum 32 characters)');
  }
  if (!hasValue('TEACHER_PORTAL_KEY')) missing.push('TEACHER_PORTAL_KEY');
  if (!hasValue('NEXT_PUBLIC_APP_URL')) missing.push('NEXT_PUBLIC_APP_URL');
  if (!hasValue('DEVELOPER_USERNAME')) missing.push('DEVELOPER_USERNAME');
  if (!hasValue('DEVELOPER_PASSWORD')) missing.push('DEVELOPER_PASSWORD');
  if (missing.length > 0) {
    throw new Error(`Missing required production env vars: ${missing.join(', ')}`);
  }
}

validateBuildEnv();

const nextConfig = {
  // Sentry source maps for production error tracking
  productionBrowserSourceMaps: process.env.SENTRY_DSN ? true : false,
  // Serverless routes never execute the offline PDF/index builders or local
  // ONNX model runtime. Excluding those broad filesystem traces keeps Vercel
  // functions below the standard 250 MB limit while retaining the compact,
  // tracked RAG fallbacks in lib/context.
  outputFileTracingExcludes: {
    '/api/**': [
      './dataset/**/*',
      './scripts/**/*',
      './node_modules/@huggingface/transformers/**/*',
      './node_modules/onnxruntime-common/**/*',
      './node_modules/onnxruntime-node/**/*',
      './lib/context/chunks.jsonl',
      './lib/context/chunk_vectors.jsonl',
      './lib/context/chunk_vectors.jsonl.gz',
      './lib/context/retrieval_index.json',
    ],
  },
  // Limit parallel static-generation workers to prevent OOM on machines
  // with large RAG context files (retrieval_index.json etc.) in lib/context/.
  experimental: {
    workerThreads: false,
    cpus: 2,
  },
  // Prevent webpack from bundling large runtime-only context files (chunks.jsonl,
  // retrieval_index.json, etc.) that are read via fs.readFile at runtime.
  webpack(config) {
    config.module.rules.push({
      test: /lib[\\/]context[\\/].+\.(jsonl|json)$/,
      type: 'javascript/auto',
      loader: 'null-loader',
    });
    return config;
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'ncert.nic.in' },
      { protocol: 'https', hostname: 'cbseacademic.nic.in' },
    ],
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
          { key: 'Cross-Origin-Opener-Policy', value: process.env.CROSS_ORIGIN_OPENER_POLICY || 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: process.env.CROSS_ORIGIN_RESOURCE_POLICY || 'same-origin' },
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
  // Disable the PWA service worker in development. A stale SW intercepts
  // navigations and can break auth (logged-in pages bounce back to /login).
  // PWA stays fully enabled in production builds.
  disable: process.env.NODE_ENV === 'development',
});

module.exports = withSerwist(nextConfig);

// ── Sentry: wraps build with source maps + error instrumentation ──
if (process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN) {
  const { withSentryConfig } = require('@sentry/nextjs');
  module.exports = withSentryConfig(module.exports, {
    org: process.env.SENTRY_ORG || 'adithya-s-nair',
    project: process.env.SENTRY_PROJECT || 'javascript-nextjs',
    authToken: process.env.SENTRY_AUTH_TOKEN,
    silent: true,
    widenClientFileUpload: true,
    hideSourceMaps: true,
    webpack: {
      treeshake: {
        removeDebugLogging: true,
      },
    },
  });
}
