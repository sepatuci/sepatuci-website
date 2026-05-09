import createMDX from "@next/mdx";

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"],
  // pg and node-cron are used only by server/db.js and server/cron.js —
  // Next.js never imports them, but marking them external prevents any
  // accidental bundling if the tracer follows the import graph.
  serverExternalPackages: ["pg", "node-cron"],
};

const withMDX = createMDX({
  extension: /\.(md|mdx)$/,
});

export default withMDX(nextConfig);
