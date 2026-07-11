import { defineConfig } from "vitest/config";

import { elfuiMacroPlugin } from "./packages/compiler/src/vite";
import { elfuiDevAliases } from "./scripts/elfui-dev-alias";

export default defineConfig({
  plugins: [elfuiMacroPlugin()],
  define: {
    __DEV__: "true"
  },
  resolve: {
    alias: elfuiDevAliases
  },
  test: {
    environment: "jsdom",
    exclude: ["**/node_modules/**", "**/dist/**", "**/.claude/**", "tools/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["**/dist/**", "**/*.config.*"]
    }
  }
});
