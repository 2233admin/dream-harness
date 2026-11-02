---
name: drama-outline
version: 0.1.0
description: |
  把故事设定（bible.md）或已有正文写成短剧分集大纲 outline.json：人物、场景、叙事道具清单，
  每集梗概、开场钩子、结尾钩子、爽点。爽点间隔、钩子、引用完整性等由 dh validate outline 检查。
  Use when asked to 分集大纲、出大纲、分集梗概、爽点表、outline。
triggers:
  - drama-outline
  - 分集大纲
  - 出大纲
  - 分集梗概
  - 爽点表
---

# drama-outline：分集大纲

输入：已确认的 `story/bible.md`（idea 入口），或已有连载正文（serial 入口）。小说改编走 `drama-adapt`，它会调用本 skill 的方法。
输出：`outline.json`，通过 `dh validate outline`，并经作者确认。

契约：`contracts/outline.schema.json`。方法细则：[references/outline-method.md](references/outline-method.md)，动笔前先读。

## 流程

1. **跑 `dh status`。** idea 入口下 bible 没通过，大纲门会报 X1，先回 `drama-idea`。
2. **先写清单。** `characters`、`locations`、`props`。id 用小写字母、数字和连字符（`lin-wan`）。下游每个 id 都会变成一套资产，能少就少。
3. **写分集。** 每集这些字段都要写：`number`、`title`、`synopsis`、`hook.opening`、`hook.cliffhanger`、`payoffs`、`characters` 和 `locations`（`props` 按需）。超过 10 集分批写，每批不超过 10 集，批与批之间对齐清单和爽点，不靠上一批的原文。
4. **跑 `dh validate outline`，修到通过。** WARN 列给作者决定。
5. **⛔ 作者确认大纲后**，交给 `drama-script`。

## 边界

- 梗概写叙述体，不写台词（O10 拦引号对白）。
- 集数由 `project.json` 定（O4）。想改集数，先问作者，再改 `project.json`。
- 清单里的人物、场景、道具，是下游定妆和美术的唯一来源；不要在剧本阶段临时加人。
