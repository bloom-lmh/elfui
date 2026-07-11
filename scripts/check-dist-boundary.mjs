import { execFileSync } from "node:child_process";

const readTrackedFiles = () => {
  try {
    return execFileSync("git", ["ls-files"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    })
      .split(/\r?\n/)
      .map((file) => file.trim().replaceAll("\\", "/"))
      .filter(Boolean);
  } catch {
    console.log("dist boundary check skipped: current directory is not a git repository.");
    return undefined;
  }
};

const trackedFiles = readTrackedFiles();
if (trackedFiles === undefined) {
  process.exit(0);
}

const forbiddenPatterns = [
  {
    label: "package dist output",
    test: (file) => /^packages\/[^/]+\/dist\//.test(file)
  },
  {
    label: "extension package dist output",
    test: (file) => /^extensions\/[^/]+\/dist\//.test(file)
  },
  {
    label: "ui-kit dist output",
    test: (file) => /^ui-kit\/dist\//.test(file)
  },
  {
    label: "website dist output",
    test: (file) => /^website\/dist\//.test(file)
  },
  {
    label: "website vitepress cache output",
    test: (file) => /^website\/\.vitepress\/(?:cache|dist)\//.test(file)
  },
  {
    label: "tools dist output",
    test: (file) => /^tools\/[^/]+\/dist\//.test(file)
  },
  {
    label: "examples dist output",
    test: (file) => /^examples\/[^/]+\/dist\//.test(file)
  },
  {
    label: "coverage output",
    test: (file) => /(^|\/)coverage\//.test(file)
  },
  {
    label: "TypeScript build info",
    test: (file) => /(^|\/)[^/]+\.tsbuildinfo$/.test(file)
  },
  {
    label: "tsc composite output emitted next to package src",
    test: (file) => /^packages\/[^/]+\/src\/.*\.(?:js|js\.map|d\.ts|d\.ts\.map)$/.test(file)
  },
  {
    label: "tsc composite output emitted next to extension package src",
    test: (file) => /^extensions\/[^/]+\/src\/.*\.(?:js|js\.map|d\.ts|d\.ts\.map)$/.test(file)
  }
];

const violations = trackedFiles.flatMap((file) => {
  const pattern = forbiddenPatterns.find((item) => item.test(file));
  return pattern ? [{ file, label: pattern.label }] : [];
});

if (violations.length > 0) {
  console.error("Build artifacts must not be tracked in source control:");
  for (const { file, label } of violations) {
    console.error(`- ${file} (${label})`);
  }
  console.error(
    "\nRun the clean/build pipeline locally, but keep generated dist output out of git."
  );
  process.exit(1);
}

console.log("dist boundary check passed.");
