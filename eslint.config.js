// @ts-check
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/dist-preview/**",
      "**/storybook-static/**",
      "**/node_modules/**",
      "**/.turbo/**",
      "**/test-results/**",
      "**/playwright-report/**",
      "spikes/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    // Plain Node scripts (not type-checked): the config files themselves,
    // and the scripts/ directories run directly by node.
    files: ["**/*.{mjs,cjs}", "*.config.{js,ts}"],
    languageOptions: {
      globals: globals.node,
    },
  },
);
