import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// testing-library's auto-cleanup hooks into a global `afterEach` if one
// exists, but vitest.config.ts doesn't enable `test.globals`, so it never
// gets the chance — do it explicitly instead, or state leaks across
// tests within the same file (multiple renders piling up in the same
// jsdom document).
afterEach(() => {
  cleanup();
});
