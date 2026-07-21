import { Buffer } from "node:buffer";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";
import { chromium, firefox, webkit } from "playwright-core";

const root = resolve(".");
const aliases = {
  "@elfui/shared": resolve(root, "packages/shared/src/index.ts"),
  "@elfui/reactivity": resolve(root, "packages/reactivity/src/index.ts"),
  "@elfui/runtime": resolve(root, "packages/runtime/src/index.ts"),
  "@elfui/runtime/internal": resolve(root, "packages/runtime/src/internal.ts"),
  "@elfui/core": resolve(root, "packages/core/src/index.ts")
};

const aliasPlugin = {
  name: "elfui-browser-fixture-alias",
  setup(buildApi) {
    buildApi.onResolve(
      { filter: /^@elfui\/(?:shared|reactivity|runtime(?:\/internal)?|core)$/ },
      (args) => ({ path: aliases[args.path] })
    );
  }
};

const chromeCandidates =
  process.platform === "win32"
    ? [
        process.env.CHROME_PATH,
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
      ]
    : [
        process.env.CHROME_PATH,
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
        "google-chrome",
        "google-chrome-stable",
        "chromium",
        "chromium-browser",
        "microsoft-edge"
      ];

const decode = (value) => JSON.parse(Buffer.from(value, "base64").toString("utf8"));

export const runBrowserFixture = async (entry, browserFlags = [], options = {}) => {
  const entries = Array.isArray(entry) ? entry : [entry];
  const outputs = await Promise.all(
    entries.map(async (currentEntry) => {
      const bundle = await build({
        entryPoints: [resolve(root, currentEntry)],
        bundle: true,
        format: "iife",
        minify: true,
        write: false,
        platform: "browser",
        legalComments: "none",
        define: { __DEV__: "false", ...(options.define ?? {}) },
        plugins: [aliasPlugin, ...(options.plugins ?? [])]
      });
      const output = bundle.outputFiles[0];
      if (!output) {
        throw new Error(`Browser fixture bundle was not generated for ${currentEntry}.`);
      }
      return output.text;
    })
  );

  const tempDir = await mkdtemp(resolve(tmpdir(), "elfui-browser-fixture-"));
  const htmlPath = resolve(tempDir, "index.html");
  await writeFile(
    htmlPath,
    `<!doctype html><html><head><meta charset="utf-8"></head><body>${outputs.map((output) => `<script>${output}</script>`).join("")}</body></html>`,
    "utf8"
  );

  const browserName = options.browserName ?? "chromium";
  const browserType = { chromium, firefox, webkit }[browserName];
  if (!browserType) throw new Error(`Unsupported browser engine: ${browserName}.`);
  const browserPath =
    browserName === "chromium"
      ? chromeCandidates.find((candidate) => candidate && existsSync(candidate))
      : undefined;
  if (browserName === "chromium" && !browserPath) {
    throw new Error(
      "Chrome/Chromium executable was not found. Set CHROME_PATH to run browser integration tests."
    );
  }

  const browser = await browserType.launch({
    ...(browserPath ? { executablePath: browserPath } : {}),
    headless: true,
    args:
      browserName === "chromium"
        ? ["--allow-file-access-from-files", ...browserFlags]
        : browserFlags
  });
  try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.stack || error.message));
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
    await page.waitForSelector("#result, #error", { state: "attached", timeout: 15000 });
    const resultNode = page.locator("#result, #error");
    const resultId = await resultNode.getAttribute("id");
    const payload = await resultNode.getAttribute("data-json");
    if (resultId === "error" && payload) {
      const error = decode(payload);
      throw new Error(error.stack || error.message);
    }
    if (resultId !== "result" || !payload) {
      throw new Error(
        `Browser fixture ${entries.join(", ")} did not produce a result payload.\n${pageErrors.join("\n")}`
      );
    }
    return decode(payload);
  } finally {
    await browser.close();
    await rm(tempDir, { recursive: true, force: true });
  }
};
