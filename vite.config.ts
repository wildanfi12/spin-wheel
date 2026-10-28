import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  plugins: [
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
      // Activate a new build as soon as it is available. Waiting for a hidden
      // install prompt leaves kiosk/HDMI browsers stuck on stale cached UI.
      registerType: "autoUpdate",
      includeAssets: ["assets/*.png"],
      manifest: {
        name: "HOWELL SPIN & WIN",
        short_name: "HOWELL",
        theme_color: "#FFD600",
        background_color: "#111111",
        lang: "id",
        display: "standalone",
        start_url: "./",
        scope: "./",
        icons: [{ src: "assets/icon.png", sizes: "any", type: "image/png" }],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,webmanifest}"],
        maximumFileSizeToCacheInBytes: 4000000,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
});
