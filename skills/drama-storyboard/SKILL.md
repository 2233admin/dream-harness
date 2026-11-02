---
name: drama-storyboard
version: 0.1.0
description: |
  把剧本切成与具体视频模型无关的分镜 storyboard.json（ShotSpec）：集 → 段（一次视频生成，≤15 秒）→ 镜（认领剧本节拍）。
  每镜写景别、角度、运镜、主体与动作、场景状态、道具、首帧画面和镜头正文。
  节拍不重不漏、台词装得下、单段时长、主体在场、首帧点名、正文不点名等由 dh validate storyboard 检查。
  Use when asked to 分镜、切镜、镜头表、storyboard、shot list。
triggers:
  - drama-storyboard
  - 分镜
  - 切镜
  - 镜头表
  - storyboard
---

# drama-storyboard：分镜

输入：已通过的 `script.json`、`art.json`，以及**已锁定**的 `cast.json`。
输出：`storyboard.json`，通过 `dh validate storyboard`。可以分批，一批一集或几集。

契约：`contracts/storyboard.schema.json`。方法细则：[references/storyboard-method.md](references/storyboard-method.md)，动笔前先读。

## 流程

1. **跑 `dh status`。** 角色没锁定会报 K9：回 `drama-cast` 请作者确认定妆，不要自己写 `locked`。
2. **一次切一集。** 拿齐这一集的全部场次与节拍、出场角色的锚点和服装、场景的光照状态与道具。
3. **先分段，再切镜。** 段是一次视频生成，不超过 15 秒，不跨场次；段内每镜认领连续的节拍。
4. **每镜写满：** 景别、角度、运镜、主体与动作、场景状态、道具、首帧画面（`frame`）、镜头正文（`body`），声音可选。
5. **跑 `dh validate storyboard`，修到通过。** K13 警告表示还有集没分镜，按批次继续。
6. **⛔ 每集分镜交给作者确认，** 再进入提示词阶段。

## 边界

- 不改台词、不改剧情。节拍是剧本定的，分镜只决定怎么拍。
- 不写具体模型的提示词格式；那是 `drama-prompt` 的事（M3）。这里的字段对所有视频模型通用。
- 剧本里没有的动作和人物，不在分镜里加。
