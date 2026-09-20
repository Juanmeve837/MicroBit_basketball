import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Web Bluetooth exige HTTPS o localhost. `--host` permite probar desde el
// celular (Bluefy) en la misma red, pero en ese caso hace falta HTTPS
// (ver README de frontend/ para instrucciones con mkcert).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
