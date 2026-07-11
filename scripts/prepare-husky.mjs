// 仅在仓库内运行 husky install，避免发布到 npm 时报错
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

if (!existsSync(".git")) {
  process.exit(0);
}

const result = spawnSync("npx", ["husky", "install"], {
  stdio: "inherit",
  shell: true
});

process.exit(result.status ?? 0);
