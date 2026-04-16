import tsEslint from "typescript-eslint";
import unusedImports from "eslint-plugin-unused-imports";

export default tsEslint.config(...tsEslint.configs.recommended, {
  plugins: {
    "unused-imports": unusedImports,
  },
  rules: {
    "@typescript-eslint/no-unused-vars": "off",
    "unused-imports/no-unused-imports": "error",
    "unused-imports/no-unused-vars": [
      "warn",
      {
        vars: "all",
        varsIgnorePattern: "^_",
        args: "after-used",
        argsIgnorePattern: "^_",
      },
    ],
  },
});
