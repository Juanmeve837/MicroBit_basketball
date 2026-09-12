import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base solo aplica al build de produccion (GitHub Pages sirve el sitio bajo
// /MicroBit_basketball/, no en la raiz del dominio). En dev queda en "/" para
// que el proxy de /api siga funcionando igual.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/MicroBit_basketball/" : "/",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
}));
