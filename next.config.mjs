import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Serveur autonome pour l'image Docker (voir Dockerfile).
  output: 'standalone',
  // Le dossier parent contient un autre package-lock.json : sans cette ligne,
  // Next.js y placerait la racine du projet.
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
};
export default nextConfig;
