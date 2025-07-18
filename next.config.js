/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: true,
    serverComponentsExternalPackages: ['@prisma/client'],
    esmExternals: true
  },
  output: 'standalone',
  trailingSlash: false,
  eslint: {
    dirs: ['app', 'lib', 'server', 'modules']
  },
  typescript: {
    ignoreBuildErrors: false
  },
  poweredByHeader: false,
  reactStrictMode: true,
  swcMinify: true,
  images: {
    domains: ['images.resolvemyclaim.co.uk'],
    formats: ['image/webp', 'image/avif']
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin'
          }
        ]
      }
    ]
  }
}

module.exports = nextConfig 