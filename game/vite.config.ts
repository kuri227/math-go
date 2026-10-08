import { defineConfig } from "vitest/config";

const gameRoot = decodeURIComponent(new URL(".", import.meta.url).pathname)
  .replace(/^\/([A-Za-z]:)/, "$1");

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
    rollupOptions: {
      input: {
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

