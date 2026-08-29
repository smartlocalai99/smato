import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.js"],
  },
  resolve: {
    alias: { "@": path.resolve(".") },
  },
});
