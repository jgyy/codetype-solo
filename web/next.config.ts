import type { NextConfig } from "next";

const config: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  transpilePackages: ["@codetype/shared"],
  reactStrictMode: true,
};

export default config;
