#!/usr/bin/env node

import { runBrowserFixture } from "./browser-fixture-runner.mjs";

const report = await runBrowserFixture("integration/host-frameworks/native-entry.ts", [
  "--disable-gpu"
]);

for (const testCase of report.cases) {
  console.log(`browser smoke passed: ${testCase.name}`);
}
