#!/usr/bin/env node

import { runBrowserFixture } from "./browser-fixture-runner.mjs";

const browsers = (process.env.ELFUI_BROWSERS ?? "chromium,firefox,webkit")
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean);

for (const browserName of browsers) {
  const report = await runBrowserFixture(
    "integration/host-frameworks/native-entry.ts",
    browserName === "chromium" ? ["--disable-gpu"] : [],
    { browserName }
  );
  for (const testCase of report.cases) {
    console.log(`${browserName} integration passed: ${testCase.name}`);
  }
}
