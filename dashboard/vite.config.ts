import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Build lands in server/public and is served by the same Express container
// on Cloud Run ("deploy prebuilt bundles" decision). deploy.sh runs the
// build before every deploy; server/public is gitignored (generated).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  build: {
    outDir: path.resolve(__dirname, "../server/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          // Keep the entry lean: heavy deps split into cacheable chunks.
          firebase: ["firebase/app", "firebase/auth"],
          recharts: ["recharts"],
        },
      },
    },
  },
  server: {
    proxy: { "/v1": "https://medadvisor-api-743594385075.us-west1.run.app" },
  },
});
