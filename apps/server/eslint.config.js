// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // Generated and derived code is not ours to lint.
  { ignores: ["src/generated/**", "dist/**", "coverage/**"] },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        // Type-aware linting: feed ESLint the same type information
        // tsc uses, so rules can reason about promises, null, etc.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Plain JS files (like this config) have no type info to lint with.
  {
    files: ["**/*.js"],
    ...tseslint.configs.disableTypeChecked,
  },
);
