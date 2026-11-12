import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const engineRoot = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3001,
    fs: { allow: [engineRoot] },
    proxy: {
      "/api": "http://localhost:3000",
      "/slides": "http://localhost:3000",
    },
  },
});
