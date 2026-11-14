import path from 'node:path';
import type { NextConfig } from 'next';
import { config as muatEnv } from 'dotenv';

// Satu tempat pengaturan: .env di akar repositori (MONGODB_URI, AUTH_SECRET, …). Nilai yang sudah ada
// (dari apps/web/.env.local atau variabel lingkungan server/Docker) tidak ditimpa.
muatEnv({ path: path.resolve(process.cwd(), '../../.env') });

// Windows: terminal VS Code memberi cwd "c:\..." sedangkan symlink pnpm memakai "C:\...". Webpack lalu membundel
// dua salinan modul klien Next.js ("multiple modules with names that only differ in casing") dan halaman crash
// di browser dengan "invariant expected layout router to be mounted". Samakan huruf drive sebelum build/dev.
if (process.platform === 'win32' && /^[a-z]:/.test(process.cwd())) {
  process.chdir(process.cwd()[0].toUpperCase() + process.cwd().slice(1));
}

const produksi = process.env.NODE_ENV === 'production';

/** CSP ketat; Next.js butuh 'unsafe-inline' untuk skrip hidrasi dan 'unsafe-eval' hanya saat dev. */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${produksi ? '' : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const config: NextConfig = {
  // standalone hanya untuk image Docker (Linux); di Windows pembuatan symlink-nya butuh hak khusus
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  poweredByHeader: false,
  transpilePackages: ['@danboy/core', '@danboy/db', '@danboy/schema', '@danboy/excel'],
  serverExternalPackages: ['mongoose', 'mongodb', '@node-rs/argon2', 'bullmq', 'exceljs', 'ioredis'],
  experimental: { serverActions: { bodySizeLimit: '2mb' } },
  outputFileTracingRoot: path.resolve(process.cwd(), '../..'),
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default config;
