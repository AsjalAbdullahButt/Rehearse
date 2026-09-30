import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "product.spec.ts",
  workers: 2,
  use: {
    baseURL: "http://127.0.0.1:3199",
    trace: "retain-on-failure",
    reducedMotion: "reduce",
    launchOptions: {
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
    },
  },
  webServer: [
    {
      command: "node e2e/ui-api.mjs",
      url: "http://127.0.0.1:3198/health",
      reuseExistingServer: false,
    },
    {
      command: "pnpm exec next start -p 3199",
      url: "http://127.0.0.1:3199",
      reuseExistingServer: false,
      env: {
        API_URL: "http://127.0.0.1:3198",
        INTERNAL_PROXY_SECRET: "ui-fixture-proxy-secret-only-for-tests",
      },
    },
  ],
});
