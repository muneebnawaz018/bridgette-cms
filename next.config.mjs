/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep heavy/native-ish server deps out of the bundle — loaded at runtime instead.
  // Improves build speed and avoids bundling issues as the data layer grows.
  serverExternalPackages: ['mongoose', 'bcryptjs', 'pino', 'pino-pretty'],
};

export default nextConfig;
