import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // native modules (vector DB + local embedding model) must not be bundled
  serverExternalPackages: ["@lancedb/lancedb", "@huggingface/transformers", "onnxruntime-node", "sharp"],
};

export default nextConfig;
