export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      ["feat", "fix", "docs", "style", "refactor", "perf", "test", "build", "ci", "chore"]
    ],
    // 关闭 subject-case 限制（默认禁止 sentence-case，与中文 commit message 不兼容）
    "subject-case": [0],
    // 允许 subject 中包含中文标点等
    "subject-full-stop": [0]
  }
};
