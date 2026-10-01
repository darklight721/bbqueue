import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, lazyPlugins } from "vite-plus";
import { VitePWA } from "vite-plugin-pwa";

const themeColor = "#16a34a";
const backgroundColor = "#ffffff";

// https://vite.dev/config/
export default defineConfig({
  fmt: {
    ignorePatterns: [
      "dist/**",
      "dev-dist/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "blob-report/**",
      "pnpm-lock.yaml",
      "skills-lock.json",
      "**/*.md",
      ".scratch/**",
      ".agents/**",
      ".claude/**",
    ],
  },
  lint: {
    ignorePatterns: [
      "dist/**",
      "dev-dist/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "blob-report/**",
    ],
    plugins: ["react", "typescript", "oxc"],
    rules: {
      "react/rules-of-hooks": "error",
      "react/only-export-components": [
        "warn",
        {
          allowConstantExport: true,
        },
      ],
      "vite-plus/prefer-vite-plus-imports": "error",
    },
    options: {
      typeAware: true,
      typeCheck: true,
    },
    jsPlugins: [
      {
        name: "vite-plus",
        specifier: "vite-plus/oxlint-plugin",
      },
    ],
  },
  plugins: lazyPlugins(() => [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["favicon.ico", "favicon.svg", "apple-touch-icon-180x180.png"],
      manifest: {
        name: "Badminton Queue",
        short_name: "Badminton",
        description: "Badminton Queue",
        theme_color: themeColor,
        background_color: backgroundColor,
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
      },
    }),
  ]),
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
  },
});
