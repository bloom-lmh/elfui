#!/usr/bin/env node
/* global WebSocket, location, MouseEvent, Event, File, DataTransfer, getComputedStyle, URL */
import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import net from "node:net";

const root = resolve(".");
const uiKitDir = resolve(root, "ui-kit");
const args = process.argv.slice(2);

const hasArg = (name) => args.includes(`--${name}`);
const readArg = (name) => {
  const prefix = `--${name}=`;
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
};

const timeoutMs = Number(readArg("timeout") ?? 20000);
const screenshotDir = resolve(root, readArg("screenshot-dir") ?? "output/playwright/ui-kit-smoke");
const baseUrlArg = readArg("base-url");

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
        "google-chrome",
        "google-chrome-stable",
        "chromium",
        "chromium-browser",
        "microsoft-edge"
      ];

const findExecutable = (candidates) =>
  candidates.find((candidate) => candidate && existsSync(candidate));

const getFreePort = async () =>
  await new Promise((resolvePort, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolvePort(address.port));
    });
  });

const removeDirBestEffort = async (dir) => {
  for (let i = 0; i < 5; i++) {
    try {
      await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      return;
    } catch (err) {
      if (i === 4) {
        const code = err && typeof err === "object" && "code" in err ? err.code : "";
        if (code === "EBUSY" || code === "EPERM" || code === "ENOTEMPTY") return;
        throw err;
      }
      await delay(150);
    }
  }
};

const startViteServer = async () => {
  const port = Number(readArg("port") ?? (await getFreePort()));
  const viteBin =
    [
      resolve(uiKitDir, "node_modules/vite/bin/vite.js"),
      resolve(root, "node_modules/vite/bin/vite.js")
    ].find((candidate) => existsSync(candidate)) ?? "";
  if (!existsSync(viteBin)) {
    throw new Error("Vite executable was not found. Run pnpm install before ui-kit smoke.");
  }

  const child = spawn(
    process.execPath,
    [
      viteBin,
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
      "--clearScreen",
      "false",
      "--force"
    ],
    {
      cwd: uiKitDir,
      env: { ...process.env, FORCE_COLOR: "0", BROWSER: "none" },
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

  const logs = [];
  const remember = (chunk) => {
    const text = chunk.toString();
    logs.push(text);
    if (logs.length > 40) logs.shift();
  };
  child.stdout.on("data", remember);
  child.stderr.on("data", remember);

  let exited = false;
  child.once("exit", (code, signal) => {
    exited = true;
    if (code !== 0 && code !== null) {
      logs.push(`\n[vite exited with code ${code}]\n`);
    } else if (signal) {
      logs.push(`\n[vite exited by signal ${signal}]\n`);
    }
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (exited) {
      throw new Error(`ui-kit dev server exited early.\n${logs.join("")}`);
    }
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return { baseUrl, child, logs };
    } catch {
      /* retry */
    }
    await delay(100);
  }

  child.kill();
  throw new Error(`ui-kit dev server did not start.\n${logs.join("")}`);
};

const waitForDevToolsPort = async (userDataDir) => {
  const file = resolve(userDataDir, "DevToolsActivePort");
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const content = await readFile(file, "utf8");
      const [port, path] = content.trim().split(/\r?\n/);
      if (port && path) return { port, path };
    } catch {
      /* retry */
    }
    await delay(50);
  }
  throw new Error("Chrome did not expose a DevTools endpoint.");
};

const startChrome = async () => {
  const browserPath = findExecutable(chromeCandidates);
  if (!browserPath) {
    throw new Error(
      [
        "Chrome/Chromium executable was not found.",
        "Set CHROME_PATH to run ui-kit browser smoke, for example:",
        "  CHROME_PATH=/path/to/chrome node scripts/smoke-ui-kit-browser.mjs"
      ].join("\n")
    );
  }

  const userDataDir = resolve(tmpdir(), `elfui-ui-kit-smoke-${process.pid}-${Date.now()}`);
  await mkdir(userDataDir, { recursive: true });

  const child = spawn(
    browserPath,
    [
      hasArg("headed") ? "" : "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${userDataDir}`,
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--window-size=1440,960",
      "about:blank"
    ].filter(Boolean),
    { stdio: ["ignore", "ignore", "ignore"] }
  );

  child.once("exit", (code) => {
    if (code && code !== 0) {
      console.error(`Chrome exited with code ${code}.`);
    }
  });

  const devtools = await waitForDevToolsPort(userDataDir);
  return { browserPath, child, userDataDir, devtools };
};

class CdpClient {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Map();
    this.ws = new WebSocket(url);
  }

  async open() {
    await new Promise((resolveOpen, reject) => {
      this.ws.addEventListener("open", resolveOpen, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    this.ws.addEventListener("message", (event) => {
      const raw = typeof event.data === "string" ? event.data : event.data.toString();
      const message = JSON.parse(raw);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) {
          pending.reject(new Error(`${message.error.message}: ${message.error.data ?? ""}`));
        } else {
          pending.resolve(message.result ?? {});
        }
        return;
      }
      const handlers = this.handlers.get(message.method) ?? [];
      for (const handler of handlers) handler(message.params ?? {});
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolveSend, reject) => {
      this.pending.set(id, { resolve: resolveSend, reject });
    });
  }

  on(method, handler) {
    const handlers = this.handlers.get(method) ?? [];
    handlers.push(handler);
    this.handlers.set(method, handlers);
  }

  once(method) {
    return new Promise((resolveOnce) => {
      const handler = (params) => {
        const handlers = this.handlers.get(method) ?? [];
        this.handlers.set(
          method,
          handlers.filter((candidate) => candidate !== handler)
        );
        resolveOnce(params);
      };
      this.on(method, handler);
    });
  }

  close() {
    this.ws.close();
  }
}

const connectPage = async (port) => {
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((res) => res.json());
  const page = targets.find((target) => target.type === "page");
  if (!page?.webSocketDebuggerUrl) throw new Error("Chrome page target was not found.");
  const client = new CdpClient(page.webSocketDebuggerUrl);
  await client.open();
  return client;
};

const shouldIgnoreBrowserError = (text) => {
  const normalized = String(text || "");
  return normalized.includes("favicon.ico") || normalized.includes("net::ERR_ABORTED");
};

const expressionFor = (fn, argsForFn = []) => `(${fn.toString()})(...${JSON.stringify(argsForFn)})`;

const evaluate = async (client, fn, argsForFn = []) => {
  const result = await client.send("Runtime.evaluate", {
    expression: expressionFor(fn, argsForFn),
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  });
  if (result.exceptionDetails) {
    const details = result.exceptionDetails;
    const message = details.exception?.description || details.text || "Runtime.evaluate failed";
    throw new Error(message);
  }
  return result.result?.value;
};

const waitForExpression = async (client, label, fn, argsForFn = []) => {
  const startedAt = Date.now();
  let lastValue;
  while (Date.now() - startedAt < timeoutMs) {
    lastValue = await evaluate(client, fn, argsForFn);
    if (lastValue?.ok) return lastValue;
    await delay(100);
  }
  throw new Error(`${label} timed out. Last value: ${JSON.stringify(lastValue)}`);
};

const navigate = async (client, baseUrl, route) => {
  const target = `${baseUrl}/#${route}`;
  const loaded = client.once("Page.loadEventFired");
  await client.send("Page.navigate", { url: target });
  await Promise.race([loaded, delay(3000)]);
};

const captureScreenshot = async (client, name) => {
  await mkdir(screenshotDir, { recursive: true });
  const result = await client.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true
  });
  const file = resolve(screenshotDir, `${name}.png`);
  await writeFile(file, Buffer.from(result.data, "base64"));
  return file;
};

const smokeHelperSource = `
(() => {
  const visit = (node, out = []) => {
    if (!node) return out;
    if (node.nodeType === Node.ELEMENT_NODE) {
      out.push(node);
      if (node.shadowRoot) visit(node.shadowRoot, out);
    }
    for (const child of Array.from(node.childNodes || [])) visit(child, out);
    return out;
  };
  const textOf = (root = document) => {
    const pieces = [];
    const walk = (node) => {
      if (!node) return;
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.nodeValue && node.nodeValue.trim();
        if (text) pieces.push(text);
        return;
      }
      if (node.nodeType === Node.ELEMENT_NODE && node.shadowRoot) walk(node.shadowRoot);
      for (const child of Array.from(node.childNodes || [])) walk(child);
    };
    walk(root);
    return pieces.join("\\n");
  };
  const clickElfButtonByText = (text) => {
    const elements = visit(document);
    const hosts = elements.filter(
      (el) => el.localName === "elf-button" && (textOf(el) || el.textContent || "").includes(text)
    );
    for (const host of hosts) {
      const button = host.shadowRoot?.querySelector("button") || host;
      if (!button.disabled) {
        button.click();
        return { ok: true, clicked: host.localName, text: textOf(host) || host.textContent?.trim() };
      }
    }
    const native = elements.find(
      (el) =>
        el instanceof HTMLButtonElement &&
        !el.disabled &&
        ((textOf(el) || el.textContent || "").trim().includes(text))
    );
    if (native) {
      native.click();
      return { ok: true, clicked: "button", text: textOf(native) || native.textContent?.trim() };
    }
    return { ok: false, reason: "button text not found: " + text };
  };
  globalThis.__elfSmoke = {
    elements: visit,
    text: textOf,
    clickElfButtonByText,
    first: (predicate) => visit(document).find(predicate)
  };
})();
`;

const pageReady = (route, expected) => {
  const smoke = globalThis.__elfSmoke;
  const elements = smoke.elements(document);
  const text = smoke.text(document);
  const app = document.querySelector("elf-app");
  const menu = elements.find((el) => el.localName === "elf-menu");
  const menuItems = menu?.shadowRoot?.querySelectorAll(".menu-item").length ?? 0;
  const templatesInMenu = menu?.shadowRoot?.querySelectorAll("template").length ?? 0;
  const routeView = elements.find((el) => el.localName === "elf-router-view");
  const visibleMenu = Boolean(menuItems >= 40 && text.includes("Button 按钮"));
  const routeMatches =
    route === "/" ? location.hash === "#/" || location.hash === "" : location.hash === `#${route}`;
  return {
    ok:
      Boolean(customElements.get("elf-app")) &&
      Boolean(app?.shadowRoot) &&
      Boolean(routeView) &&
      Boolean(expected ? text.includes(expected) : true) &&
      visibleMenu &&
      templatesInMenu === 0 &&
      routeMatches,
    hash: location.hash,
    expected,
    hasAppShadow: Boolean(app?.shadowRoot),
    hasRouteView: Boolean(routeView),
    menuItems,
    templatesInMenu,
    textHit: expected ? text.includes(expected) : true,
    visibleMenu,
    routeMatches
  };
};

const clickElfButtonByText = (text) => {
  return globalThis.__elfSmoke.clickElfButtonByText(text);
};

const dialogOpened = () => {
  const mask = document.querySelector(".elf-dialog-mask");
  const panel = document.querySelector(".elf-dialog-panel");
  return {
    ok: Boolean(mask && panel && document.body.textContent?.includes("这是一段对话框内容")),
    hasMask: Boolean(mask),
    hasPanel: Boolean(panel)
  };
};

const dialogClosed = () => ({ ok: !document.querySelector(".elf-dialog-mask") });

const drawerOpened = () => {
  const mask = document.querySelector(".elf-drawer-mask");
  const panel = document.querySelector(".elf-drawer-panel");
  return {
    ok: Boolean(mask && panel && document.body.textContent?.includes("右侧抽屉")),
    hasMask: Boolean(mask),
    hasPanel: Boolean(panel)
  };
};

const closeDrawerByMask = () => {
  const mask = document.querySelector(".elf-drawer-mask");
  if (!mask) return { ok: false, reason: "drawer mask not found" };
  mask.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
  return { ok: true };
};

const drawerClosed = () => ({ ok: !document.querySelector(".elf-drawer-mask") });

const openFirstDropdown = () => {
  const host = globalThis.__elfSmoke.first((el) => el.localName === "elf-dropdown");
  const button = host?.shadowRoot?.querySelector("button");
  if (!host || !button) return { ok: false, reason: "dropdown host/button not found" };
  button.click();
  return { ok: Boolean(host.hasAttribute("data-open")), open: host.hasAttribute("data-open") };
};

const dropdownOpened = () => {
  const hosts = globalThis.__elfSmoke
    .elements(document)
    .filter((el) => el.localName === "elf-dropdown");
  const host = hosts.find((item) => item.hasAttribute("data-open")) || hosts[0];
  const menu = host?.shadowRoot?.querySelector(".menu.is-open");
  return {
    ok: Boolean(host?.hasAttribute("data-open") && menu),
    open: Boolean(host?.hasAttribute("data-open")),
    hasMenu: Boolean(menu)
  };
};

const chooseDropdownItem = () => {
  const host = globalThis.__elfSmoke
    .elements(document)
    .filter((el) => el.localName === "elf-dropdown")
    .find((item) => item.hasAttribute("data-open"));
  const button = Array.from(host?.shadowRoot?.querySelectorAll("button") || []).find((item) =>
    (item.textContent || "").includes("编辑资料")
  );
  if (!button) return { ok: false, reason: "dropdown item not found" };
  button.click();
  return { ok: true };
};

const dropdownCommandApplied = () => ({
  ok: Boolean(globalThis.__elfSmoke.text(document).includes("edit / 编辑资料"))
});

const showFirstTooltip = () => {
  const tooltip = globalThis.__elfSmoke.first((el) => el.localName === "elf-tooltip");
  const container = tooltip?.shadowRoot?.querySelector(".tooltip-container");
  if (!container) return { ok: false, reason: "tooltip container not found" };
  container.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false, composed: true }));
  return { ok: true };
};

const tooltipOpened = () => {
  const tooltip = globalThis.__elfSmoke.first((el) => el.localName === "elf-tooltip");
  const content = tooltip?.shadowRoot?.querySelector("[role='tooltip']");
  return {
    ok: Boolean(content && (content.textContent || "").includes("Tooltip 在上方")),
    hasContent: Boolean(content)
  };
};

const tableRendered = () => {
  const table = globalThis.__elfSmoke.first((el) => el.localName === "elf-table");
  const shadow = table?.shadowRoot;
  const rows = shadow?.querySelectorAll("tbody tr").length ?? 0;
  const header = shadow?.querySelector("thead");
  return { ok: Boolean(table && header && rows > 0), rows, hasHeader: Boolean(header) };
};

const sortFirstTable = () => {
  const table = globalThis.__elfSmoke.first((el) => el.localName === "elf-table");
  const button = table?.shadowRoot?.querySelector(".sort-button");
  if (!button) return { ok: false, reason: "sort button not found" };
  button.click();
  return { ok: true };
};

const tableSorted = () => {
  const table = globalThis.__elfSmoke.first((el) => el.localName === "elf-table");
  const sorted = table?.shadowRoot?.querySelector(".sort-button.is-sorted");
  return { ok: Boolean(sorted), hasSorted: Boolean(sorted) };
};

const submitForm = () => globalThis.__elfSmoke.clickElfButtonByText("提交");

const formValidationShown = () => ({
  ok: Boolean(globalThis.__elfSmoke.text(document).includes("校验未通过"))
});

const progressCircleRendered = () => {
  const progress = globalThis.__elfSmoke
    .elements(document)
    .filter((el) => el.localName === "elf-progress")
    .find((el) => el.getAttribute("variant") === "circle");
  const circle = progress?.shadowRoot?.querySelector(".circle-value");
  const svg = progress?.shadowRoot?.querySelector("svg");
  return {
    ok: Boolean(
      progress &&
      svg?.namespaceURI === "http://www.w3.org/2000/svg" &&
      circle?.namespaceURI === "http://www.w3.org/2000/svg"
    ),
    svgNamespace: svg?.namespaceURI,
    circleNamespace: circle?.namespaceURI
  };
};

const checkboxGroupUpdates = () => {
  const group = globalThis.__elfSmoke.first((el) => el.localName === "elf-checkbox-group");
  const target = Array.from(group?.querySelectorAll("elf-checkbox") || []).find(
    (item) => item.getAttribute("value") === "guangzhou"
  );
  const box = target?.shadowRoot?.querySelector(".box");
  if (!group || !target || !box) return { ok: false, reason: "checkbox group target not found" };
  box.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
  const modelValue = group.modelValue;
  return {
    ok: Array.isArray(modelValue) && modelValue.includes("guangzhou"),
    modelValue
  };
};

const sliderRangeCrosses = () => {
  const range = globalThis.__elfSmoke
    .elements(document)
    .filter((el) => el.localName === "elf-slider")
    .find((el) => el.hasAttribute("range"));
  const input = range?.shadowRoot?.querySelector(".native-start");
  if (!range || !input) return { ok: false, reason: "range slider not found" };
  let detail;
  range.addEventListener(
    "change",
    (event) => {
      detail = event.detail;
    },
    { once: true }
  );
  input.value = "90";
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return {
    ok: Array.isArray(detail) && detail[0] <= detail[1] && detail[1] === 90,
    detail
  };
};

const uploadAcceptsInjectedFile = () => {
  const upload = globalThis.__elfSmoke.first((el) => el.localName === "elf-upload");
  const input = upload?.shadowRoot?.querySelector("input[type='file']");
  if (!upload || !input) return { ok: false, reason: "upload input not found" };
  const file = new File(["hello"], "smoke.txt", { type: "text/plain" });
  const dt = new DataTransfer();
  dt.items.add(file);
  try {
    input.files = dt.files;
  } catch {
    Object.defineProperty(input, "files", { value: dt.files, configurable: true });
  }
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return { ok: true };
};

const uploadFileShown = () => ({
  ok: Boolean(globalThis.__elfSmoke.text(document).includes("smoke.txt"))
});

const stickyUsesInnerStickyNode = () => {
  const sticky = globalThis.__elfSmoke.first((el) => el.localName === "elf-sticky");
  const inner = sticky?.shadowRoot?.querySelector(".sticky");
  const position = inner ? getComputedStyle(inner).position : "";
  return { ok: position === "sticky", position };
};

const treeHasCleanContainer = () => {
  const tree = globalThis.__elfSmoke.first((el) => el.localName === "elf-tree");
  const container = tree?.shadowRoot?.querySelector(".tree");
  const firstNode = tree?.shadowRoot?.querySelector(".tree-node");
  const style = container ? getComputedStyle(container) : null;
  return {
    ok: Boolean(container && firstNode && style?.borderTopWidth === "0px"),
    borderTopWidth: style?.borderTopWidth,
    hasNode: Boolean(firstNode)
  };
};

const carouselArrowsStayOutOfTheWay = () => {
  const carousel = globalThis.__elfSmoke.first((el) => el.localName === "elf-carousel");
  const arrows = carousel?.shadowRoot?.querySelector(".arrows");
  const opacity = arrows ? getComputedStyle(arrows).opacity : "";
  return { ok: opacity === "0", opacity };
};

const stepsCanChangeActive = () => {
  const steps = globalThis.__elfSmoke
    .elements(document)
    .filter((el) => el.localName === "elf-steps")[1];
  const buttons = steps?.shadowRoot?.querySelectorAll(".step-button");
  if (!steps || !buttons || buttons.length < 3) return { ok: false, reason: "steps not found" };
  buttons[2].click();
  return {
    ok: globalThis.__elfSmoke.text(document).includes("切换到第 3 步")
  };
};

const popConfirmCanConfirm = () => {
  const pop = globalThis.__elfSmoke.first((el) => el.localName === "elf-pop-confirm");
  const trigger = pop?.shadowRoot?.querySelector(".pop-confirm");
  if (!pop || !trigger) return { ok: false, reason: "pop confirm not found" };
  trigger.click();
  const action = pop.shadowRoot?.querySelector(".pop-confirm-action.primary");
  if (!action) return { ok: false, reason: "confirm action not found" };
  action.click();
  return {
    ok: globalThis.__elfSmoke.text(document).includes("已确认删除")
  };
};

const startTour = () => globalThis.__elfSmoke.clickElfButtonByText("开始引导");

const tourTitleContains = (text) => ({
  ok: Boolean((document.body.querySelector(".tour-title")?.textContent || "").includes(text)),
  title: document.body.querySelector(".tour-title")?.textContent || ""
});

const clickTourPrimary = () => {
  const primary = document.body.querySelector(".tour-footer elf-button[color='primary']");
  if (!primary) return { ok: false, reason: "tour primary button not found" };
  primary.click();
  return { ok: true };
};

const tourFinishing = () => {
  const layer = document.body.querySelector(".tour-layer");
  return {
    ok: !layer || layer.classList.contains("is-closing"),
    hasLayer: Boolean(layer),
    className: layer?.className || ""
  };
};

const navigateByAppMenu = (index) => {
  const menu = document.querySelector("elf-app")?.shadowRoot?.querySelector("elf-menu");
  const button = menu?.shadowRoot?.querySelector(`[data-index="${index}"]`);
  if (!button) return { ok: false, reason: `menu item not found: ${index}` };
  button.click();
  return { ok: true };
};

const sendEscape = async (client) => {
  await client.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27
  });
  await client.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27
  });
};

const run = async () => {
  await mkdir(screenshotDir, { recursive: true });
  const server = baseUrlArg
    ? { baseUrl: baseUrlArg, child: null, logs: [] }
    : await startViteServer();
  const chrome = await startChrome();
  const errors = [];
  const screenshots = [];
  let client;

  try {
    client = await connectPage(chrome.devtools.port);
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Log.enable");
    await client.send("Page.addScriptToEvaluateOnNewDocument", { source: smokeHelperSource });
    await client.send("Runtime.evaluate", { expression: smokeHelperSource });

    client.on("Runtime.exceptionThrown", (params) => {
      const text = params.exceptionDetails?.exception?.description || params.exceptionDetails?.text;
      if (!shouldIgnoreBrowserError(text)) errors.push(`Runtime exception: ${text}`);
    });
    client.on("Runtime.consoleAPICalled", (params) => {
      if (params.type !== "error") return;
      const text = (params.args || []).map((arg) => arg.value || arg.description || "").join(" ");
      if (!shouldIgnoreBrowserError(text)) errors.push(`console.error: ${text}`);
    });
    client.on("Log.entryAdded", (params) => {
      const entry = params.entry || {};
      if (entry.level !== "error") return;
      const text = [entry.text, entry.url].filter(Boolean).join(" ");
      if (!shouldIgnoreBrowserError(text)) errors.push(`log.error: ${text}`);
    });

    const routes = [
      ["/", "ElfUI 组件库", "home"],
      ["/basic/button", "Button 按钮", "button"],
      ["/navigation/menu", "Menu 导航菜单", "menu"],
      ["/feedback/dialog", "Dialog 对话框", "dialog"],
      ["/feedback/drawer", "Drawer 抽屉", "drawer"],
      ["/navigation/dropdown", "Dropdown 下拉菜单", "dropdown"],
      ["/feedback/tooltip", "Tooltip 文字气泡提示", "tooltip"],
      ["/data/table", "Table 表格", "table"],
      ["/form/form", "Form 表单", "form"],
      ["/data/progress", "Progress 进度条", "progress"],
      ["/form/checkbox", "Checkbox 复选框", "checkbox"],
      ["/form/slider", "Slider 滑块", "slider"],
      ["/form/upload", "Upload 上传", "upload"],
      ["/layout/sticky", "Sticky 吸附", "sticky"],
      ["/data/tree", "Tree 树", "tree"],
      ["/data/carousel", "Carousel 轮播图", "carousel"],
      ["/navigation/steps", "Steps 步骤条", "steps"],
      ["/feedback/pop-confirm", "PopConfirm 气泡确认", "pop-confirm"],
      ["/feedback/tour", "Tour 漫游式引导", "tour"]
    ];

    for (const [route, expected, name] of routes) {
      await navigate(client, server.baseUrl, route);
      await waitForExpression(client, `route ${route}`, pageReady, [route, expected]);
      if (["home", "button", "menu"].includes(name)) {
        screenshots.push(await captureScreenshot(client, name));
      }
    }

    await navigate(client, server.baseUrl, "/feedback/dialog");
    await waitForExpression(client, "dialog page", pageReady, [
      "/feedback/dialog",
      "Dialog 对话框"
    ]);
    await waitForExpression(client, "click dialog button", clickElfButtonByText, ["打开对话框"]);
    await waitForExpression(client, "dialog opens", dialogOpened);
    screenshots.push(await captureScreenshot(client, "dialog-open"));
    await sendEscape(client);
    await waitForExpression(client, "dialog closes on escape", dialogClosed);

    await navigate(client, server.baseUrl, "/feedback/drawer");
    await waitForExpression(client, "drawer page", pageReady, ["/feedback/drawer", "Drawer 抽屉"]);
    await waitForExpression(client, "click drawer button", clickElfButtonByText, ["右滑 (RTL)"]);
    await waitForExpression(client, "drawer opens", drawerOpened);
    screenshots.push(await captureScreenshot(client, "drawer-open"));
    await waitForExpression(client, "click drawer mask", closeDrawerByMask);
    await waitForExpression(client, "drawer closes on outside click", drawerClosed);

    await navigate(client, server.baseUrl, "/navigation/dropdown");
    await waitForExpression(client, "dropdown page", pageReady, [
      "/navigation/dropdown",
      "Dropdown 下拉菜单"
    ]);
    await waitForExpression(client, "open dropdown", openFirstDropdown);
    await waitForExpression(client, "dropdown opened", dropdownOpened);
    screenshots.push(await captureScreenshot(client, "dropdown-open"));
    await waitForExpression(client, "choose dropdown item", chooseDropdownItem);
    await waitForExpression(client, "dropdown command applies", dropdownCommandApplied);

    await navigate(client, server.baseUrl, "/feedback/tooltip");
    await waitForExpression(client, "tooltip page", pageReady, [
      "/feedback/tooltip",
      "Tooltip 文字气泡提示"
    ]);
    await waitForExpression(client, "show tooltip", showFirstTooltip);
    await waitForExpression(client, "tooltip opened", tooltipOpened);
    screenshots.push(await captureScreenshot(client, "tooltip-open"));

    await navigate(client, server.baseUrl, "/data/table");
    await waitForExpression(client, "table page", pageReady, ["/data/table", "Table 表格"]);
    await waitForExpression(client, "table renders", tableRendered);
    await waitForExpression(client, "sort table", sortFirstTable);
    await waitForExpression(client, "table sorted", tableSorted);
    screenshots.push(await captureScreenshot(client, "table-sorted"));

    await navigate(client, server.baseUrl, "/form/form");
    await waitForExpression(client, "form page", pageReady, ["/form/form", "Form 表单"]);
    await waitForExpression(client, "submit form", submitForm);
    await waitForExpression(client, "form validation shown", formValidationShown);
    screenshots.push(await captureScreenshot(client, "form-validation"));

    await navigate(client, server.baseUrl, "/data/progress");
    await waitForExpression(client, "progress page", pageReady, [
      "/data/progress",
      "Progress 进度条"
    ]);
    await waitForExpression(client, "progress circle rendered", progressCircleRendered);
    screenshots.push(await captureScreenshot(client, "progress-circle"));

    await navigate(client, server.baseUrl, "/form/checkbox");
    await waitForExpression(client, "checkbox page", pageReady, [
      "/form/checkbox",
      "Checkbox 复选框"
    ]);
    await waitForExpression(client, "checkbox group updates", checkboxGroupUpdates);
    screenshots.push(await captureScreenshot(client, "checkbox-group"));

    await navigate(client, server.baseUrl, "/form/slider");
    await waitForExpression(client, "slider page", pageReady, ["/form/slider", "Slider 滑块"]);
    await waitForExpression(client, "slider range crosses", sliderRangeCrosses);
    screenshots.push(await captureScreenshot(client, "slider-range"));

    await navigate(client, server.baseUrl, "/form/upload");
    await waitForExpression(client, "upload page", pageReady, ["/form/upload", "Upload 上传"]);
    await waitForExpression(client, "inject upload file", uploadAcceptsInjectedFile);
    await waitForExpression(client, "upload file shown", uploadFileShown);
    screenshots.push(await captureScreenshot(client, "upload-file"));

    await navigate(client, server.baseUrl, "/layout/sticky");
    await waitForExpression(client, "sticky page", pageReady, ["/layout/sticky", "Sticky 吸附"]);
    await waitForExpression(client, "sticky uses inner node", stickyUsesInnerStickyNode);
    screenshots.push(await captureScreenshot(client, "sticky"));

    await navigate(client, server.baseUrl, "/data/tree");
    await waitForExpression(client, "tree page", pageReady, ["/data/tree", "Tree 树"]);
    await waitForExpression(client, "tree clean container", treeHasCleanContainer);
    screenshots.push(await captureScreenshot(client, "tree"));

    await navigate(client, server.baseUrl, "/data/carousel");
    await waitForExpression(client, "carousel page", pageReady, [
      "/data/carousel",
      "Carousel 轮播图"
    ]);
    await waitForExpression(client, "carousel arrows stay subtle", carouselArrowsStayOutOfTheWay);
    screenshots.push(await captureScreenshot(client, "carousel"));

    await navigate(client, server.baseUrl, "/navigation/steps");
    await waitForExpression(client, "steps page", pageReady, ["/navigation/steps", "Steps 步骤条"]);
    await waitForExpression(client, "steps can change active", stepsCanChangeActive);
    screenshots.push(await captureScreenshot(client, "steps"));

    await navigate(client, server.baseUrl, "/feedback/pop-confirm");
    await waitForExpression(client, "pop confirm page", pageReady, [
      "/feedback/pop-confirm",
      "PopConfirm 气泡确认"
    ]);
    await waitForExpression(client, "pop confirm can confirm", popConfirmCanConfirm);
    screenshots.push(await captureScreenshot(client, "pop-confirm"));

    await navigate(client, server.baseUrl, "/feedback/tour");
    await waitForExpression(client, "tour page", pageReady, ["/feedback/tour", "Tour 漫游式引导"]);
    await waitForExpression(client, "start tour", startTour);
    await waitForExpression(client, "tour first step", tourTitleContains, ["项目概览"]);
    await waitForExpression(client, "tour next step", clickTourPrimary);
    await waitForExpression(client, "tour second step", tourTitleContains, ["主要操作"]);
    await waitForExpression(client, "tour third step", clickTourPrimary);
    await waitForExpression(client, "tour finish step", clickTourPrimary);
    await waitForExpression(client, "tour finishing", tourFinishing);
    screenshots.push(await captureScreenshot(client, "tour"));

    await navigate(client, server.baseUrl, "/");
    await waitForExpression(client, "menu navigates to table", navigateByAppMenu, ["/data/table"]);
    await waitForExpression(client, "router updates from menu", pageReady, [
      "/data/table",
      "Table 表格"
    ]);

    if (errors.length > 0) {
      throw new Error(`Browser console errors:\n${errors.join("\n")}`);
    }

    console.log("\nui-kit browser smoke passed");
    console.log(`base url: ${server.baseUrl}`);
    console.log(`browser: ${basename(chrome.browserPath)}`);
    console.log(`screenshots: ${screenshotDir}`);
    for (const file of screenshots) {
      console.log(`- ${fileURLToPath(new URL(`file:///${file.replace(/\\/g, "/")}`))}`);
    }
  } finally {
    client?.close();
    chrome.child.kill();
    await removeDirBestEffort(chrome.userDataDir);
    if (server.child) {
      server.child.kill();
      await delay(100);
    }
  }
};

run().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : err);
  process.exit(1);
});
