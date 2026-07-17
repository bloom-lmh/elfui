#!/usr/bin/env node

import { runBrowserFixture } from "./browser-fixture-runner.mjs";

const report = await runBrowserFixture(
  [
    "integration/runtime-copies/runtime-a-entry.ts",
    "integration/runtime-copies/runtime-b-entry.ts",
    "integration/runtime-copies/verify-entry.ts"
  ],
  ["--disable-gpu"]
);

for (const testCase of report.cases) {
  console.log(`runtime copy integration passed: ${testCase.name}`);
}
