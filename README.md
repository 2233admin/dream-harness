# dream-harness

由 Agent 调用的短剧创作 skill 集合：写文（原创 / 改编 / 长篇连载）→ 分集大纲 → 剧本 → 资产设定 → 分镜 → 各模型提示词 → 生成 → 验收。

设计稿见 [docs/design.md](docs/design.md)。

## 现状（M2）

| Skill | 做什么 |
| --- | --- |
| [drama](skills/drama) | 总入口：判断阶段、路由下一步、守住人工确认点 |
| [drama-idea](skills/drama-idea) | 一句话创意 → 故事设定 `story/bible.md` |
| [drama-adapt](skills/drama-adapt) | 小说原文 → `dh import` 切章 → 带原文证据的改编大纲 |
| [drama-outline](skills/drama-outline) | 故事设定或正文 → 分集大纲 `outline.json` |
| [drama-script](skills/drama-script) | 分集大纲 → 剧本 `script.json` |
| [drama-cast](skills/drama-cast) | 角色设定 `cast.json`：外形锚点、服装、英文出图与音色提示词、定妆锁定 |
| [drama-art](skills/drama-art) | 美术设定 `art.json`：年代、场景锚点与光照状态、叙事道具 |
| [drama-storyboard](skills/drama-storyboard) | 分镜 `storyboard.json`：集 → 段 → 镜，与具体视频模型无关 |

| 其他 | 说明 |
| --- | --- |
| `contracts/` | `project`、`source`、`outline`、`script`、`cast`、`art`、`storyboard` 共享契约（JSON Schema） |
| `bin/dh.mjs` | CLI：`init`、`import`、`status`、`validate`、`doctor`；零依赖，Node 22+ |
| `examples/night-pharmacist/` | 原创样例《夜班药师》：一句话创意入口，走到角色、美术与第 1 集分镜 |
| `examples/clock-repair/` | 原创样例《修表铺》：小说改编入口，走到大纲 |

质量门清单见 [skills/drama/references/pipeline.md](skills/drama/references/pipeline.md)。

## 快速试用

```bash
node bin/dh.mjs status --project examples/night-pharmacist
node bin/dh.mjs validate all --project examples/clock-repair
node bin/dh.mjs init my-drama --title 我的短剧 --episodes 20 --source novel
node bin/dh.mjs import 我的小说.txt --project my-drama
node bin/dh.mjs doctor
```

退出码：0 通过，1 质量门有错误，2 参数或环境错误。

## 开发

```bash
npm test
```

参考来源与许可证见 [NOTICE](NOTICE)。

本项目以 Apache License 2.0 发布，见 [LICENSE](LICENSE)。
