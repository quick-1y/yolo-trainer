import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Native dev (D-19): `vite dev` proxies /api to the FastAPI app running on
// the host via `uvicorn --reload`. The compose stack (nginx) does its own
// proxying in production/acceptance mode - this block is dev-only.
const apiProxyTarget = "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
  preview: {
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
});
