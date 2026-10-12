import createMDX from "@next/mdx";

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"],

  // Stops `next dev` from writing AGENTS.md and CLAUDE.md into the repository root.
  agentRules: false,

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
      // @opentelemetry/api is deliberately not excluded: firebase-admin's
      // Firestore client loads it at startup, and the portal API needs it.
      "node_modules/@opentelemetry/core/**",
      "node_modules/@opentelemetry/sdk-trace-base/**",
      "node_modules/@opentelemetry/sdk-trace-node/**",
      "node_modules/@opentelemetry/context-async-hooks/**",
      "node_modules/node-cron/**",
      "node_modules/rss-parser/**",
      "node_modules/pg/**",
      "node_modules/better-sqlite3/**",
      "node_modules/express/**",
    ],
  },

  // The members-only portal and its sign-in pages are never framed, indexed
  // or cached, and never leak their address (which can carry a one-time
  // password-reset code) to other sites.
  async headers() {
    const privatePage = [
      { key: "X-Frame-Options", value: "DENY" },
      {
        key: "Content-Security-Policy",
        value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
      },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
      { key: "X-Content-Type-Options", value: "nosniff" },
    ];
    return [
      // The public pages too: the sign-in page is reached from them without a
      // fresh page load, so a frame around the home page would otherwise carry over.
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
      { source: "/login/:path*", headers: privatePage },
      { source: "/portal/:path*", headers: privatePage },
      {
        source: "/api/portal/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Robots-Tag", value: "noindex" },
        ],
      },
    ];
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
