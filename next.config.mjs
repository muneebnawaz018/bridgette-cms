/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // A second Next process (a production build check, a browser test) writes into the same
  // .next as a running `npm run dev` and breaks it — the dev server starts requiring chunks
  // that were replaced, or manifests that vanished. Point those runs at their own directory
  // instead: NEXT_DIST_DIR=.next-probe npx next dev -p 3997
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Hide Next's dev-only build-activity badge (the spinning "N" bottom-left). Our own
  // BrandLoader overlay already covers route transitions, so the badge is just noise.
  devIndicators: false,
  // Keep heavy/native-ish server deps out of the bundle — loaded at runtime instead.
  // Improves build speed and avoids bundling issues as the data layer grows.
  serverExternalPackages: ['mongoose', 'bcryptjs', 'pino', 'pino-pretty'],
};

export default nextConfig;
