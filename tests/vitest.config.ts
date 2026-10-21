import path from "node:path";
import { defineConfig } from "vitest/config";

const rootDir = path.resolve(__dirname, "..");

export default defineConfig({
  root: rootDir,
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "apps/web/src"),
    },
  },
  // The web tsconfig keeps JSX for Next ("preserve"); tests that render a
  // component need it compiled.
  oxc: {
    jsx: { runtime: "automatic" },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    // Fork: GitHub's shared machines are slower; the heavy geometry tests (Gridfinity) ran past
    // the 5 s default there now and then. Locally the default stays.
    testTimeout: process.env.CI ? 30_000 : 5_000,
  },
});
