import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy /api to backend during dev so no CORS issue
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
