import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/functions/**", "**/node_modules/**", "**/dist/**"]
  }
});
