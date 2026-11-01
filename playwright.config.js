const { defineConfig } = require("@playwright/test");
module.exports = defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  reporter: "list",
  use: {
    actionTimeout: 10000,
    baseURL: "http://127.0.0.1:3101",
    channel: "chrome",
    viewport: { width: 1440, height: 1050 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node scripts/e2e-server.js",
    url: "http://127.0.0.1:3101/setup",
    reuseExistingServer: false,
    timeout: 15000,
  },
});
