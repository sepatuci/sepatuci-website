import createMDX from "@next/mdx";

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"],

  experimental: {
    serverComponentsExternalPackages: [
      'better-sqlite3',
      'node-cron',
      '@opentelemetry/api',
    ],
  },

  serverExternalPackages: [
    'better-sqlite3',
    'express',
    'node-cron',
    '@opentelemetry/api',
  ],

  outputFileTracingExcludes: {
    "*": [
      "node_modules/@opentelemetry/**",
      "node_modules/better-sqlite3/**",
      "node_modules/node-cron/**",
    ],
  },

  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        'better-sqlite3',
        'node-cron',
        '@opentelemetry/api',
        '@opentelemetry/core',
        '@opentelemetry/sdk-trace-base',
        '@opentelemetry/sdk-trace-node',
      ];
    }
    return config;
  },
};

const withMDX = createMDX({
  extension: /\.(md|mdx)$/,
});

export default withMDX(nextConfig);
