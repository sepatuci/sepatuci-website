import createMDX from "@next/mdx";

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"],

  experimental: {
    serverComponentsExternalPackages: [
      "node-cron",
      "rss-parser",
      "pg",
      "better-sqlite3",
      "express",
      "dotenv",
      "@opentelemetry/api",
      "@opentelemetry/core",
      "@opentelemetry/sdk-trace-base",
      "@opentelemetry/sdk-trace-node",
      "@opentelemetry/context-async-hooks",
    ],
  },

  serverExternalPackages: [
    "node-cron",
    "rss-parser",
    "pg",
    "better-sqlite3",
    "express",
    "dotenv",
    "@opentelemetry/api",
    "@opentelemetry/core",
    "@opentelemetry/sdk-trace-base",
    "@opentelemetry/sdk-trace-node",
    "@opentelemetry/context-async-hooks",
  ],

  outputFileTracingExcludes: {
    "/**": [
      "node_modules/@opentelemetry/**",
      "node_modules/node-cron/**",
      "node_modules/rss-parser/**",
      "node_modules/pg/**",
      "node_modules/better-sqlite3/**",
      "node_modules/express/**",
    ],
  },

  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        "node-cron",
        "rss-parser",
        "pg",
        "better-sqlite3",
        "express",
        "dotenv",
        "@opentelemetry/api",
        "@opentelemetry/core",
        "@opentelemetry/sdk-trace-base",
        "@opentelemetry/sdk-trace-node",
        "@opentelemetry/context-async-hooks",
      ];
    }
    return config;
  },
};

const withMDX = createMDX({
  extension: /\.(md|mdx)$/,
});

export default withMDX(nextConfig);
