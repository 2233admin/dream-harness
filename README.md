# drama-harness

由 Agent 调用的短剧创作 skill 集合：写文（原创 / 改编 / 长篇连载）→ 分集大纲 → 剧本 → 资产设定 → 分镜 → 各模型提示词 → 生成 → 验收。

设计稿见 [docs/design.md](docs/design.md)。

## 现状（M0）

| 已有 | 说明 |
| --- | --- |
| `contracts/` | `project`、`outline`、`script` 三份共享契约（JSON Schema） |
| `bin/dh.mjs` | CLI：`init`、`status`、`validate`、`doctor`；零依赖，Node 22+ |
| `skills/drama/` | 总入口 skill：判断阶段、路由下一步、守住人工确认点 |
| `examples/night-pharmacist/` | 原创三集样例《夜班药师》，全部质量门通过 |

质量门清单见 [skills/drama/references/pipeline.md](skills/drama/references/pipeline.md)。

## 快速试用

```bash
node bin/dh.mjs status --project examples/night-pharmacist
node bin/dh.mjs validate all --project examples/night-pharmacist
node bin/dh.mjs init my-drama --title 我的短剧 --episodes 20 --source idea
node bin/dh.mjs doctor
```

退出码：0 通过，1 质量门有错误，2 参数或环境错误。

## 开发

```bash
npm test
```

参考来源与许可证见 [NOTICE](NOTICE)。
