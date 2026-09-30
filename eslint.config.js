import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "supabase/functions/**",
      "apps/admin/next-env.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        fetch: "readonly",
        URL: "readonly",
        Response: "readonly",
        Request: "readonly",
        AbortSignal: "readonly",
        TextEncoder: "readonly",
        btoa: "readonly",
        setTimeout: "readonly",
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        Buffer: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
    },
  }
);
