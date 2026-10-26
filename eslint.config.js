import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/dist-test/**", "**/node_modules/**", "demo-repo/**", "**/.vscode-test/**", "apps/**", "demo/out/**", "**/.next/**", "test/fixtures/**"] },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
);
