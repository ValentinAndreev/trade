import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  resolve: {
    alias: {
      config: path.resolve(__dirname, "app/javascript/config"),
      utils: path.resolve(__dirname, "app/javascript/utils"),
      services: path.resolve(__dirname, "app/javascript/services"),
      tabs: path.resolve(__dirname, "app/javascript/tabs"),
      templates: path.resolve(__dirname, "app/javascript/templates"),
      chart: path.resolve(__dirname, "app/javascript/chart"),
      types: path.resolve(__dirname, "app/javascript/types"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["app/javascript/__tests__/**/*.test.ts"],
    globals: true,
  },
})
