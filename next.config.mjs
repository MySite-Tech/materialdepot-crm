import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin Turbopack's workspace root to THIS project. Without this, Next walks up
  // the folder tree and (because of a stray lockfile in the parent /depot folder)
  // treats the whole /depot directory as the root — watching every sibling
  // project's node_modules and blowing up memory.
  turbopack: {
    root: __dirname,
  },
  transpilePackages: ['@radix-ui/react-slot', '@radix-ui/react-label', '@radix-ui/react-radio-group', 'class-variance-authority', 'clsx', 'tailwind-merge', 'lucide-react'],
};

export default nextConfig;
