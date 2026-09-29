/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Puppeteer lance Chrome depuis node_modules : a charger tel quel, pas a empaqueter.
  serverExternalPackages: ['whatsapp-web.js', 'puppeteer', 'puppeteer-core'],
};
export default nextConfig;
