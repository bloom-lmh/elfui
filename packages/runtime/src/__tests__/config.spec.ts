import { afterEach, describe, expect, it } from "vitest";

import { configure, getConfig, resetConfig } from "../config";

afterEach(() => {
  resetConfig();
});

describe("C7 configure / getConfig", () => {
  it("uses the default runtime config", () => {
    const config = getConfig();

    expect(config).toEqual({
      globalProperties: {},
      warnHandler: null,
      errorHandler: null
    });
  });

  it("merges globalProperties", () => {
    configure({ globalProperties: { theme: "dark" } });
    configure({ globalProperties: { locale: "zh-CN" } });

    expect(getConfig().globalProperties).toEqual({ theme: "dark", locale: "zh-CN" });
  });

  it("resets globalProperties when an empty object is passed", () => {
    configure({ globalProperties: { theme: "dark" } });
    configure({ globalProperties: {} });

    expect(getConfig().globalProperties).toEqual({});
  });

  it("returns a snapshot so external mutation cannot pollute config", () => {
    configure({ globalProperties: { a: 1 } });
    const snapshot = getConfig();
    (snapshot.globalProperties as Record<string, unknown>).a = 2;

    expect(getConfig().globalProperties).toEqual({ a: 1 });
  });

  it("updates warn and error handlers", () => {
    const warnHandler = (): void => {};
    const errorHandler = (): void => {};

    configure({ warnHandler, errorHandler });

    expect(getConfig().warnHandler).toBe(warnHandler);
    expect(getConfig().errorHandler).toBe(errorHandler);
  });

  it("resetConfig restores defaults", () => {
    configure({
      globalProperties: { a: 1 },
      warnHandler: () => {},
      errorHandler: () => {}
    });

    resetConfig();

    expect(getConfig()).toEqual({
      globalProperties: {},
      warnHandler: null,
      errorHandler: null
    });
  });
});
