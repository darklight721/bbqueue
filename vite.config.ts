import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, lazyPlugins } from "vite-plus";
import { VitePWA } from "vite-plugin-pwa";

// Set by `pnpm test:firebase`: run the emulator tests instead of the regular ones.
const emulatorTests = process.env.FIREBASE_EMULATOR_TESTS === "1";

const themeColor = "#0b6b45";
const backgroundColor = "#f7f9f4";

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves the app from /<repo>/; the deploy workflow sets BASE_PATH.
  base: process.env.BASE_PATH ?? "/",
  fmt: {
    ignorePatterns: [
      "dist/**",
      "dist-emulator/**",
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
      "dist-emulator/**",
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
        name: "BBQueue",
        short_name: "BBQueue",
        description: "Balanced Badminton Queue",
        theme_color: themeColor,
        background_color: backgroundColor,
        display: "standalone",
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
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
      },
    }),
  ]),
  test: emulatorTests
    ? {
        // `pnpm test:firebase`: tests that talk to the Firebase emulators (they need Java).
        // One file at a time, since they share the emulators' data.
        environment: "node",
        globals: false,
        include: ["src/**/*.emulator.test.ts"],
        fileParallelism: false,
        testTimeout: 30_000,
        hookTimeout: 30_000,
      }
    : {
        environment: "jsdom",
        globals: false,
        setupFiles: ["src/test/setup.ts"],
        // Tests run with no Backend unless they set one, even when `.env.local` has a real
        // Firebase config.
        env: {
          VITE_BACKEND: "",
          VITE_FIREBASE_EMULATOR: "",
          VITE_FIREBASE_PROJECT_ID: "",
        },
        include: ["src/**/*.test.{ts,tsx}"],
        exclude: [
          "e2e/**",
          "node_modules/**",
          "dist/**",
          "dist-emulator/**",
          "src/**/*.emulator.test.ts",
        ],
      },
});
