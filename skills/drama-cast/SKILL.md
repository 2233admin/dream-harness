---
name: drama-cast
version: 0.1.0
description: |
  按分集大纲做短剧角色设定 cast.json：外形、可核对的外形锚点、服装、英文出图提示词、音色与英文音色提示词。
  作者确认定妆后锁定版本，分镜才能开始。锚点进提示词、提示词英文且不含人名等由 dh validate cast 检查。
  Use when asked to 角色设定、定妆、人物设定、形象提示词、音色、cast。
triggers:
  - drama-cast
  - 角色设定
  - 定妆
  - 形象提示词
  - 音色提示词
---

# drama-cast：角色设定

输入：已通过的 `outline.json`；有 `script.json` 更好（台词决定音色）。小说改编项目同时读 `story/source/` 里的原文。
输出：`cast.json`，通过 `dh validate cast`，作者确认后写入 `locked`。

契约：`contracts/cast.schema.json`。方法细则：[references/cast-method.md](references/cast-method.md)，动笔前先读。

## 流程

1. **角色清单以大纲为准。** 大纲里每个角色都要有一条设定，不多不少（C2）。大纲的 `role` 分档不在这里改；觉得分档不对，回 `drama-outline`。
2. **先定全剧的年代和地域。** 和 `art.json` 的 `era` 保持一致；美术还没做，就先和作者确认一句「故事发生在什么年代、什么地方」。
3. **逐个角色写：** `age`、`look`（给人读）、2–6 个外形锚点、服装、`imagePrompt`（英文）、`voice`。
4. **跑 `dh validate cast`，修到只剩 C7 警告。**
5. **⛔ 把每个角色的 look、锚点、服装和音色摆给作者看。** 作者确认后写 `"locked": { "version": 1 }`。之后改任何外形或服装字段，version 加 1，并告诉作者已出的图要重出。

## 边界

- 不改人物身份、关系、年龄段等大纲和原文已定的事实。原文没写、为了出图不得不补的外形，在 `look` 里标「（推断）」。
- 提示词只描述外观，不写人名、剧名、演员名（C5）。
- 不替作者锁定。`locked` 只在作者明确确认后写。
