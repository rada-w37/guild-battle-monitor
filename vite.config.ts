import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const basePath = process.env.VITE_BASE_PATH ?? "/guild-battle-monitor/";

export default defineConfig({
  base: basePath,
  plugins: [react()]
});
