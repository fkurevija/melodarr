import path from "node:path";
import { defineConfig } from "vitest/config";
import dotenv from "dotenv";

// Load .env.local for local testing
dotenv.config({ path: path.resolve(__dirname, ".env.local") });

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, ".")
    }
  },
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "clover"],
      include: [
        "lib/requests/service.ts",
        "lib/requests/sync-rate-limit.ts",
        "lib/cache/json-cache.ts",
        "lib/auth/login-rate-limit.ts",
        "lib/http/mutation-guard.ts",
        "lib/http/upstream-errors.ts",
        "lib/runtime/secret.ts",
        "lib/crypto/secrets.ts",
        "lib/search/foreign-id.ts",
        "lib/search/text.ts"
      ],
      thresholds: {
        statements: 50,
        branches: 40,
        functions: 50,
        lines: 50
      }
    }
  }
});
