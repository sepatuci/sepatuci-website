import createMDX from "@next/mdx";

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"],
  serverExternalPackages: ["better-sqlite3", "express", "node-cron"],
  // Exclude packages with missing files from Vercel's serverless bundle tracer
  outputFileTracingExcludes: {
    "*": [
      "node_modules/@opentelemetry/api/**/*",
      "node_modules/better-sqlite3/**/*",
    ],
  },
};

const withMDX = createMDX({
  extension: /\.(md|mdx)$/,
});

export default withMDX(nextConfig);
