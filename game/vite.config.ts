import { defineConfig } from "vitest/config";

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
  },
  build: {
    outDir: "dist",
    assetsDir: "game-assets",
    sourcemap: true,
  },
  test: {
    environment: "node",
  },
});

