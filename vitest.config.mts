import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    // Unit tests sit next to the code. Tests under tests/portal need the
    // Firebase emulators and run through `npm run test:portal`.
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
  },
});
