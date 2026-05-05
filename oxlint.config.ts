import { defineConfig } from "oxlint";
import awesomeness from "oxlint-config-awesomeness";

export default defineConfig({
  extends: [awesomeness],
  overrides: [
    // Allow pre-logger error sinks for unexpected auth/proxy
    {
      files: [
        "apps/web/src/proxy.ts",
        "apps/web/src/lib/auth-helpers.ts",
        "packages/auth/src/server.ts",
      ],
      rules: {
        "no-console": "off",
      },
    },
  ],
});
