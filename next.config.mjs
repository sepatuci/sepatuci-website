import createMDX from "@next/mdx";

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"],
  // Exclude server-only packages from the Next.js bundle —
  // these are only used by the Express API server, not by Next.js itself.
  serverExternalPackages: ["better-sqlite3", "express", "node-cron"],
};

const withMDX = createMDX({
  extension: /\.(md|mdx)$/,
});

export default withMDX(nextConfig);
