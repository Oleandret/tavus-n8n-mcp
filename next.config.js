/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow Daily.js to load properly
  webpack: (config) => {
    config.resolve.fallback = { fs: false, net: false, tls: false };
    return config;
  },
};

module.exports = nextConfig;
