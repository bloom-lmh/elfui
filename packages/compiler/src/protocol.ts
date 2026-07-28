/** Build-time protocol shared by the ElfUI compiler, Core metadata and ecosystem tooling. */
export const ELFUI_COMPILER_PROTOCOL_VERSION = 1 as const;

export interface ElfUIPackageCompatibilityInfo {
  name: string;
  version: string;
  compilerProtocol?: number;
  resolvedPath?: string;
}

export const validateElfUIPackageCompatibility = (
  packages: readonly ElfUIPackageCompatibilityInfo[]
): void => {
  const expected = packages[0];
  if (!expected) return;

  for (const current of packages.slice(1)) {
    if (current.compilerProtocol !== expected.compilerProtocol) {
      throw new Error(
        `[ELF_VITE_PROTOCOL_MISMATCH] ${expected.name}@${expected.version} uses compiler protocol ` +
          `${String(expected.compilerProtocol)}, but ${current.name}@${current.version} uses ` +
          `${String(current.compilerProtocol)}.\n` +
          `Resolved ${expected.name}: ${expected.resolvedPath ?? "unknown"}\n` +
          `Resolved ${current.name}: ${current.resolvedPath ?? "unknown"}\n` +
          "Upgrade all ElfUI build packages together, then remove node_modules/.vite."
      );
    }
    if (current.version !== expected.version) {
      throw new Error(
        `[ELF_VITE_VERSION_MISMATCH] ${expected.name}@${expected.version} does not match ` +
          `${current.name}@${current.version}. During the beta fixed release group, ` +
          "Core, Compiler and Vite Plugin must use the exact same version.\n" +
          `Resolved ${expected.name}: ${expected.resolvedPath ?? "unknown"}\n` +
          `Resolved ${current.name}: ${current.resolvedPath ?? "unknown"}\n` +
          `Fix: pnpm add ${expected.name}@${expected.version} ${current.name}@${expected.version}; ` +
          "then remove node_modules/.vite."
      );
    }
  }
};
