import { defineConfig, minimal2023Preset } from "@vite-pwa/assets-generator/config";

const background = "#0b6b45";

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: {
      ...minimal2023Preset.maskable,
      resizeOptions: { background, fit: "contain" },
    },
    apple: {
      ...minimal2023Preset.apple,
      resizeOptions: { background, fit: "contain" },
    },
  },
  images: ["public/favicon.svg"],
});
