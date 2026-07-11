import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

const browserGlobals = {
  __DEV__: "readonly",
  CustomEvent: "readonly",
  DocumentFragment: "readonly",
  Element: "readonly",
  HTMLElement: "readonly",
  Node: "readonly",
  ShadowRoot: "readonly",
  CSSStyleSheet: "readonly",
  console: "readonly",
  customElements: "readonly",
  document: "readonly",
  fetch: "readonly",
  process: "readonly",
  queueMicrotask: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  globalThis: "readonly"
};

export default tseslint.config(
  {
    ignores: [
      ".claude",
      ".claude/**",
      ".vscode-test",
      ".vscode-test/**",
      ".pnpm-store",
      ".pnpm-store/**",
      "ui-kit/dist",
      "ui-kit",
      "ui-kit/**",
      "website/dist",
      "website/.vitepress/cache",
      "website/.vitepress/dist",
      "tools",
      "tools/**",
      "coverage",
      "output",
      "output/**",
      "node_modules",
      "packages/*/dist",
      "extensions/*/dist",
      "examples/*/dist",
      "demo",
      "demo/**",
      "pnpm-lock.yaml"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,js,mjs}"],
    languageOptions: {
      globals: browserGlobals
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports"
        }
      ],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-this-alias": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_"
        }
      ]
    }
  },
  {
    files: [
      "ui-kit/src/components/**/index.ts",
      "ui-kit/src/components/**/index.elf.ts",
      "ui-kit/src/components/**/component.ts",
      "ui-kit/src/pages/**/*.ts",
      "ui-kit/src/app/AppShell/**/*.ts"
    ],
    rules: {
      // 宏组件会在 html 模板字符串中消费变量，普通 ESLint 无法识别这类引用。
      "@typescript-eslint/no-unused-vars": "off"
    }
  },
  {
    files: ["**/*.test.ts", "**/*.spec.ts"],
    rules: {
      "@typescript-eslint/ban-ts-comment": "off"
    }
  },
  eslintConfigPrettier
);
