import tseslint from "typescript-eslint";

export default tseslint.config({
  files: ["{src,scripts,scenarios}/**/*.ts"],
  extends: tseslint.configs.strictTypeChecked,
  languageOptions: {
    parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
  },
  linterOptions: { reportUnusedDisableDirectives: "error" },
  rules: {
    "@typescript-eslint/no-unsafe-type-assertion": "error",
    "@typescript-eslint/strict-boolean-expressions": [
      "error",
      {
        allowString: false,
        allowNumber: false,
        allowNullableObject: true,
        allowNullableBoolean: false,
        allowNullableString: false,
        allowNullableNumber: false,
        allowNullableEnum: false,
        allowAny: false,
      },
    ],
    "@typescript-eslint/restrict-template-expressions": [
      "error",
      {
        allowAny: false,
        allowBoolean: false,
        allowNever: false,
        allowNullish: false,
        allowNumber: true,
        allowRegExp: false,
      },
    ],
    eqeqeq: ["error", "always", { null: "ignore" }],
  },
});
