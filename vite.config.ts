import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { createSpinWheelApiMiddleware } from "./server/apiMiddleware";

export default defineConfig({
  base: "/",
  plugins: [
    {
      name: "spin-wheel-backend-api",
      configureServer(server) {
        server.middlewares.use(createSpinWheelApiMiddleware());
      },
      configurePreviewServer(server) {
        server.middlewares.use(createSpinWheelApiMiddleware());
      },
    },
    {
      name: "pages-source-entry",
      transformIndexHtml: {
        order: "pre",
        handler: (html) =>
          html
            .replace(/<link data-pages-fallback[^>]*>/g, "")
            .replace(
              /<script data-pages-fallback>[\s\S]*?<\/script>/g,
              '<script type="module" src="/src/main.tsx"></script>',
            ),
      },
    },
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["assets/*.png"],
      manifest: {
        name: "HOWELL SPIN & WIN",
        short_name: "HOWELL",
        theme_color: "#FFD600",
        background_color: "#111111",
        display: "standalone",
        start_url: "/",
        icons: [{ src: "assets/icon.png", sizes: "any", type: "image/png" }],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,webmanifest}"],
        maximumFileSizeToCacheInBytes: 4000000,
      },
    }),
  ],
});
