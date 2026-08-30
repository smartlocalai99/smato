import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
    loader: "jsx",
    include: /.*\.js$/,
    exclude: [],
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.js"],
    exclude: ["node_modules/**", ".worktrees/**"],
  },
  resolve: {
    alias: { "@": path.resolve(".") },
  },
});
