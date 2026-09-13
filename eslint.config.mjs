import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",

    // The design handoff is a vendored prototype we read from, not code
    // we ship or maintain. Its support.js is a bundled runtime that
    // predictably fails modern React rules.
    "design/**",

    // The Python virtualenv. Several scientific packages ship bundled
    // JavaScript for their HTML reprs, which eslint will happily walk
    // into and report on.
    "worker/.venv/**",
  ]),
]);

export default eslintConfig;
