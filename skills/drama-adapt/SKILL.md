---
name: drama-adapt
version: 0.1.0
description: |
  把已有小说改编成短剧分集大纲（outline.json）：dh import 切章建索引，砍线、合人、排爽点，
  每集标注对应原文章节，关键取舍附原文逐字证据，由脚本核对证据确实出自原文。
  Use when asked to 小说改编、改编短剧、小说转短剧、导入小说、adapt novel。
triggers:
  - drama-adapt
  - 小说改编
  - 改编短剧
  - 小说转短剧
  - 导入小说
---

# drama-adapt：小说改编成分集大纲

输入：小说原文（.txt，UTF-8 或 GBK 都行）。
输出：`story/source/`（章节索引）和 `outline.json`，通过 `dh validate outline`，并经作者确认。

`dh` 命令写法见 `skills/drama/SKILL.md`。动笔前先读 [references/adapt-method.md](references/adapt-method.md) 和 `skills/drama-outline/references/outline-method.md`。

## 流程

1. **收参数，一次问完。** 必问：总集数、单集时长、题材。默认改编幅度为「抽核」（`core`），告知作者即可。没有项目就 `dh init <目录> --source novel --episodes N`。
2. **导入原文。** `dh import <小说.txt> --project <目录>`。看输出的章节对照表：大纲里的章节号用这里的序号 n，不是原文标题里的「第几章」。识别不出章节时会按 5000 字切片，要明确告诉作者。
3. **读原文。** 只依据导入的章节文本做判断，不凭书名或印象补内容。长篇按段落分批读（每批不超过 15 章），每批写下：主线推进、出场人物、可用爽点、场景。
4. **快版骨架。** 先只写 `adaptation`、`characters`、`locations`、`props`，以及每集一句话的分配（哪几章进哪一集、爽点落在第几集）。
5. **⛔ 把三件事摆给作者拍板：** 砍了哪条线、合了哪些人、大爆点落在第几集。作者不点头不写分集梗概——方向错了，只损失一轮骨架。
6. **写分集。** 吸收意见后按 `drama-outline` 的方法写满每集；每集写 `source.chapters`。长剧每批不超过 10 集。
7. **跑 `dh validate outline`，修到通过。** O12（证据不在原文）说明你改写了引文：回原文逐字复制。
8. **⛔ 作者确认大纲后**，交给 `drama-script`。

## 边界

- 不写台词。梗概是叙述体，出现引号对白 O10 会拦。
- 原文是唯一依据。原文没写的设定，作为改编新增写进 `adaptation.note`，让作者看见。
- 不改 `story/source/` 下的文件；原文有更新就重新 `dh import`。
