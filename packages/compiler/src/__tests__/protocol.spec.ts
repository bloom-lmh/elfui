import { describe, expect, it } from "vitest";

import { validateElfUIPackageCompatibility } from "../protocol";

describe("ElfUI compiler protocol", () => {
  const compiler = {
    name: "@elfui/compiler",
    version: "0.1.0-beta.13",
    compilerProtocol: 1
  };

  it("accepts packages from the same fixed release group", () => {
    expect(() =>
      validateElfUIPackageCompatibility([
        compiler,
        { name: "@elfui/core", version: "0.1.0-beta.13", compilerProtocol: 1 },
        { name: "@elfui/vite-plugin", version: "0.1.0-beta.13", compilerProtocol: 1 }
      ])
    ).not.toThrow();
  });

  it("rejects incompatible protocol versions before compilation", () => {
    expect(() =>
      validateElfUIPackageCompatibility([
        compiler,
        { name: "@elfui/core", version: "0.1.0-beta.13", compilerProtocol: 2 }
      ])
    ).toThrow("[ELF_VITE_PROTOCOL_MISMATCH]");
  });

  it("rejects mixed beta versions even when the protocol is compatible", () => {
    expect(() =>
      validateElfUIPackageCompatibility([
        compiler,
        { name: "@elfui/core", version: "0.1.0-beta.12", compilerProtocol: 1 }
      ])
    ).toThrow("[ELF_VITE_VERSION_MISMATCH]");
  });
});
