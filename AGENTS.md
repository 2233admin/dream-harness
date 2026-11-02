# AGENTS.md

drama-harness：由 Agent 调用的短剧创作 skill 集合与 `dh` CLI。设计见 `docs/design.md`。

## 工作约定

- 执行态记录在本仓的 GitHub issue（`2233admin/drama-harness`）；PR 正文写 `Closes #N`。
- CLI 零依赖：只用 Node 22+ 标准库，不加 npm 依赖。
- 契约（`contracts/*.schema.json`）是所有 skill 共用的唯一数据定义。改契约必须同时改校验、样例和测试。
- 质量门由脚本判定，返回退出码 0（通过）/ 1（有问题）/ 2（参数或环境错误）。不得让模型自己宣布通过。
- skill 只写流程、判断与边界；可复用的逻辑进 `lib/`。
- 样例数据（`examples/`）是本仓原创故事，不借用参考仓的样例。
- 参考仓的方法内化进 `references/` 时注明来源；复用代码时保留原许可证声明（见 `NOTICE`）。
- 中文文案不用单字简写（写「保留」不写「保」）。
- 生成的报告（`reports/`、`*-report.html`）不进版本控制。

## 验证

```bash
npm test
node bin/dh.mjs validate all --project examples/night-pharmacist
```
