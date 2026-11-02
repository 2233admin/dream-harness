---
name: drama-art
version: 0.1.0
description: |
  按分集大纲做短剧美术设定 art.json：全剧年代、每个场景的设计意图、一致性锚点、光照状态与英文空景提示词，
  以及叙事道具的锚点、状态与英文提示词。年代具体、场景空景、锚点进提示词等由 dh validate art 检查。
  Use when asked to 美术设定、场景设定、道具设定、场景图提示词、art。
triggers:
  - drama-art
  - 美术设定
  - 场景设定
  - 道具设定
---

# drama-art：场景与道具设定

输入：已通过的 `outline.json`；有 `script.json` 更好（场次的时段决定光照状态）。
输出：`art.json`，通过 `dh validate art`。

契约：`contracts/art.schema.json`。方法细则：[references/art-method.md](references/art-method.md)，动笔前先读。

## 流程

1. **先定 `era`。** 全剧一个具体的年代与地域（A3）。和 `cast.json` 用的年代保持一致；拿不准就问作者。
2. **场景以大纲为准。** 大纲里每个场景都要有设定，不多不少（A2）。剧本里的场次 `time` 用到了哪些时段，就写哪些光照状态。
3. **叙事道具以大纲为准。** 大纲里 `narrative: true` 的道具都要有设定；非叙事道具可以不写。
4. **跑 `dh validate art`，修到通过。**
5. **把场景的设计意图、锚点和光照状态给作者过目。**

## 边界

- 不新增大纲以外的场景和道具；需要就先回 `drama-outline` 登记。
- 场景提示词永远空景，人物是另一层资产（A6）。
- 不写画风；画风在出图时统一指定。
