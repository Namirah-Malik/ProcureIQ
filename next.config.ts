import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // PGlite is a WASM module that locates its own asset files at runtime via
  // import.meta.url; Next's bundler rewrites that in a way PGlite can't
  // resolve. Keeping it external makes Node load it directly instead.
  // (This only matters for local dev — production uses Neon over HTTP, which
  // has no such issue.)
  serverExternalPackages: ["@electric-sql/pglite"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
