#!/usr/bin/env node

import { runBrowserFixture } from "./browser-fixture-runner.mjs";
import { readFile } from "node:fs/promises";

import { compile, VERSION as svelteVersion } from "svelte/compiler";

const sveltePlugin = {
  name: "svelte-host-fixture",
  setup(buildApi) {
    buildApi.onLoad({ filter: /\.svelte$/ }, async ({ path }) => {
      const source = await readFile(path, "utf8");
      const compiled = compile(source, {
        filename: path,
        generate: "client",
        dev: true
      });
      return { contents: compiled.js.code, loader: "js" };
    });
  }
};

const nativeReport = await runBrowserFixture("integration/host-frameworks/native-entry.ts", [
  "--disable-gpu"
]);
const reactReport = await runBrowserFixture(
  "integration/host-frameworks/react-entry.ts",
  ["--disable-gpu"],
  { define: { "process.env.NODE_ENV": '"development"' } }
);
const vueReport = await runBrowserFixture("integration/host-frameworks/vue-entry.ts", [
  "--disable-gpu"
]);
const svelteReport = await runBrowserFixture(
  "integration/host-frameworks/svelte-entry.ts",
  ["--disable-gpu"],
  { plugins: [sveltePlugin] }
);
const angularReport = await runBrowserFixture("integration/host-frameworks/angular-entry.ts", [
  "--disable-gpu"
]);

for (const testCase of [
  ...nativeReport.cases,
  ...reactReport.cases,
  ...vueReport.cases,
  ...svelteReport.cases,
  ...angularReport.cases
]) {
  console.log(`host integration passed: ${testCase.name}`);
}
console.log(
  `native host counts: setup=${nativeReport.native.setup}, mounted=${nativeReport.native.mounted}, renders=${nativeReport.native.renders}, unmounted=${nativeReport.native.unmounted}`
);
console.log(
  `React host counts: setup=${reactReport.react.setup}, mounted=${reactReport.react.mounted}, renders=${reactReport.react.renders}, unmounted=${reactReport.react.unmounted}, React renders=${reactReport.react.reactRenders}`
);
console.log(
  `Vue ${vueReport.vue.version} host counts: setup=${vueReport.vue.setup}, mounted=${vueReport.vue.mounted}, renders=${vueReport.vue.renders}, unmounted=${vueReport.vue.unmounted}, Vue renders=${vueReport.vue.vueRenders}`
);
console.log(
  `Svelte ${svelteVersion} host counts: setup=${svelteReport.svelte.setup}, mounted=${svelteReport.svelte.mounted}, renders=${svelteReport.svelte.renders}, unmounted=${svelteReport.svelte.unmounted}`
);
console.log(
  `Angular ${angularReport.angular.version} host counts: setup=${angularReport.angular.setup}, mounted=${angularReport.angular.mounted}, renders=${angularReport.angular.renders}, unmounted=${angularReport.angular.unmounted}`
);
