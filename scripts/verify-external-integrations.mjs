#!/usr/bin/env node

// cspell:ignore swiftshader

import { runBrowserFixture as runFixture } from "./browser-fixture-runner.mjs";

const browserReport = await runFixture("integration/external-tools/browser-entry.ts", [
  "--disable-gpu"
]);
const graphicsReport = await runFixture("integration/external-tools/graphics-entry.ts", [
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader"
]);
const overlayReport = await runFixture("integration/external-tools/overlay-entry.ts", [
  "--disable-gpu"
]);
const observersReport = await runFixture("integration/external-tools/observers-entry.ts", [
  "--disable-gpu"
]);
const asyncResourcesReport = await runFixture(
  "integration/external-tools/async-resources-entry.ts",
  ["--disable-gpu"]
);
const combinedReport = await runFixture("integration/external-tools/combined-entry.ts", [
  "--disable-gpu"
]);
const stressReport = await runFixture("integration/external-tools/stress-entry.ts", [
  "--disable-gpu"
]);

for (const testCase of [
  ...browserReport.cases,
  ...graphicsReport.cases,
  ...overlayReport.cases,
  ...observersReport.cases,
  ...asyncResourcesReport.cases,
  ...combinedReport.cases,
  ...stressReport.cases
]) {
  console.log(`external integration passed: ${testCase.name}`);
}
console.log(
  `lifecycle counts: setup=${browserReport.lifecycle.setup}, mounted=${browserReport.lifecycle.mounted}, disposed=${browserReport.lifecycle.disposed}`
);
console.log(
  `Chart.js counts: created=${browserReport.chart.created}, resized=${browserReport.chart.resized}, updates=${browserReport.chart.updates}, destroyed=${browserReport.chart.destroyed}`
);
console.log(
  `graphics counts: created=${graphicsReport.graphics.created}, resized=${graphicsReport.graphics.resized}, updates=${graphicsReport.graphics.updates}, destroyed=${graphicsReport.graphics.destroyed}`
);
console.log(
  `overlay counts: created=${overlayReport.overlay.created}, positioned=${overlayReport.overlay.positionUpdates}, clicks=${overlayReport.overlay.overlayClicks}, bridged=${overlayReport.overlay.bridgedEvents}, cleanups=${overlayReport.overlay.cleanups}, destroyed=${overlayReport.overlay.destroyed}`
);
for (const [key, counts] of Object.entries(observersReport.resources)) {
  console.log(
    `observer counts (${key}): starts=${counts.starts}, stops=${counts.stops}, mutation=${counts.mutations}, resize=${counts.resizes}, intersection=${counts.intersections}, globals=${counts.globalEvents}, unmounted=${counts.unmounted}`
  );
}
console.log(
  `async resource counts: initialized=${asyncResourcesReport.asyncResources.initializations}, ready=${asyncResourcesReport.asyncResources.ready}, cancelled=${asyncResourcesReport.asyncResources.cancelled}, workers=${asyncResourcesReport.asyncResources.workerCreated}/${asyncResourcesReport.asyncResources.workerTerminated}, wasm=${asyncResourcesReport.asyncResources.wasmCreated}, computations=${asyncResourcesReport.asyncResources.computations}, errors=${asyncResourcesReport.asyncResources.asyncErrorsCaptured}, late=${asyncResourcesReport.asyncResources.lateMessages}`
);
console.log(
  `combined counts: roots=${combinedReport.combined.rootSetups}, mounted=${combinedReport.combined.rootMounted}, unmounted=${combinedReport.combined.rootUnmounted}, resources=${combinedReport.combined.resourcesCreated}/${combinedReport.combined.resourcesDestroyed}, renders=${combinedReport.combined.externalRenders}, clicks=${combinedReport.combined.externalClicks}, active=${combinedReport.combined.activeResources}`
);
console.log(
  `stress counts: setup=${stressReport.stress.setups}, mounted=${stressReport.stress.mounted}, moves=${stressReport.stress.moves}, unmounted=${stressReport.stress.unmounted}, observers=${stressReport.stress.observersCreated}/${stressReport.stress.observersDisconnected}, listeners=${stressReport.stress.listenersCreated}/${stressReport.stress.listenersRemoved}, portals=${stressReport.stress.portalsCreated}/${stressReport.stress.portalsRemoved}, late=${stressReport.stress.lateCallbacks}, active=${stressReport.stress.activeTotal}`
);
