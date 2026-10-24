import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  use: { baseURL: "http://localhost:3100", browserName: "chromium" },
  webServer: {
    command: "node --import tsx tests/start-test-server.ts",
    url: "http://localhost:3100/api/config",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
