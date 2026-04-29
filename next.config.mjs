/** @type {import('next').NextConfig} */
const nextConfig = {
  // @ffmpeg-installer dynamically resolves the platform binary at runtime.
  // Webpack can't statically trace the require(), so leave it as an external
  // and explicitly bundle the linux-x64 binary into the serverless function.
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg"],
  outputFileTracingIncludes: {
    "/api/cron": ["./node_modules/@ffmpeg-installer/**/*"],
    "/api/client-media/upload-portal": ["./node_modules/@ffmpeg-installer/**/*"],
    "/api/client-media/generate-thumbnails": ["./node_modules/@ffmpeg-installer/**/*"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self'",
              "connect-src 'self' https://api.stripe.com https://*.prisma-data.net https://vercel.com https://*.public.blob.vercel-storage.com",
              "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
