/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Hide Next's dev-only build-activity badge (the spinning "N" bottom-left). Our own
  // BrandLoader overlay already covers route transitions, so the badge is just noise.
  devIndicators: false,
  // Keep heavy/native-ish server deps out of the bundle — loaded at runtime instead.
  // Improves build speed and avoids bundling issues as the data layer grows.
  serverExternalPackages: ['mongoose', 'bcryptjs', 'pino', 'pino-pretty'],
};

export default nextConfig;
