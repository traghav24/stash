import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist",
    rollupOptions: { input: { main: resolve(import.meta.dirname, "index.html"), pet: resolve(import.meta.dirname, "pet.html") } },
  },
});
