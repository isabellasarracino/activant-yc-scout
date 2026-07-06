import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig.json's `jsx: "preserve"` is for Next.js's own compiler;
  // vitest runs through esbuild directly, so it needs its own JSX
  // setting here (React 17+ automatic runtime — no `import React` needed
  // in component files, matching how the actual app is written).
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    setupFiles: ["tests/frontend/setup.ts"],
  },
});
