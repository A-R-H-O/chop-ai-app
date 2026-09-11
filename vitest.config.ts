import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // No @vitejs/plugin-react: its Babel chain conflicts with the one the
  // shadcn package pulls in. Vitest 5 transforms TSX with oxc out of the
  // box, so no JSX configuration is needed here.
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: [
      "lib/**/*.test.ts",
      "lib/**/*.test.tsx",
      "components/**/*.test.tsx",
    ],
  },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, ".") },
  },
});
