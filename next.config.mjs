/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@radix-ui/react-slot', '@radix-ui/react-label', '@radix-ui/react-radio-group', 'class-variance-authority', 'clsx', 'tailwind-merge', 'lucide-react'],
};

export default nextConfig;
