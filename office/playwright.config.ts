import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./visual",
  timeout: 300_000,
  workers: 1,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://127.0.0.1:3110",
    headless: true,
    launchOptions: {
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
    }
  },
  webServer: {
    command: "npm run start -- -p 3110",
    url: "http://127.0.0.1:3110",
    reuseExistingServer: false,
    timeout: 120_000
  },
  reporter: [["list"]]
});
