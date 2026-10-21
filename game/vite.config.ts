import { defineConfig } from "vitest/config";

const gameRoot = decodeURIComponent(new URL(".", import.meta.url).pathname)
  .replace(/^\/([A-Za-z]:)/, "$1");

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": { target: "http://127.0.0.1:8000", ws: true },
    },
  },
  build: {
    manifest: true,
    outDir: "dist",
    assetsDir: "game-assets",
    sourcemap: true,
    rollupOptions: {
      preserveEntrySignatures: "strict",
      output: { entryFileNames: chunk => chunk.name === "support" ? "game-assets/support.js" : "game-assets/[name]-[hash].js" },
      input: {
        support: `${gameRoot}src/support.ts`,
        single: `${gameRoot}index.html`,
        display: `${gameRoot}display.html`,
        controller: `${gameRoot}controller.html`,
      },
    },
  },
  test: {
    environment: "node",
  },
});

