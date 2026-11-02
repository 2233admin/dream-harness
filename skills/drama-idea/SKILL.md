---
name: drama-idea
version: 0.1.0
description: |
  一句话创意写成短剧故事设定（story/bible.md）：一句话、题材与卖点、主要人物、核心冲突、分集梗概。
  先给三个方向让作者挑，再写定稿；bible 的结构由 dh validate bible 检查，定稿要作者点头。
  Use when asked to 一句话创意、有个点子、想做一部短剧、写故事设定、bible、logline。
triggers:
  - drama-idea
  - 一句话创意
  - 故事设定
  - logline
---

# drama-idea：从一句话到故事设定

输入：作者的一句话创意（可能只有一个画面、一个人设或一个反转）。
输出：`story/bible.md`，通过 `dh validate bible`，并经作者确认。

`dh` 命令写法见 `skills/drama/SKILL.md`。方法细则见 [references/idea-method.md](references/idea-method.md)，动笔前先读。

## 流程

1. **确认项目。** 没有项目就先走 `drama`：`dh init <目录> --source idea --episodes N`。集数和单集时长必须问作者，不给默认值。
2. **问三件事，一次问完：** 题材与目标观众、想要的情绪（爽、甜、虐、悬疑、笑）、有没有必须保留的画面或台词。作者说「随便」就按题材的常见期待处理，并在方向卡里写明你的假设。
3. **给三个方向。** 每个方向一张卡：一句话、卖点、主角的欲望与阻碍、第一集结尾的钩子。三个方向要真的不同（换题材、换主角、换冲突来源），不是同一个故事换说法。
4. **作者选一个（或混合）后写 bible.md。** 五个章节都必须写满：一句话、题材与卖点、主要人物、核心冲突、梗概。梗概按集编号列，条数等于 `project.json` 的集数。
5. **跑 `dh validate bible`。** 有 ERROR 就补；B2 警告（梗概条数与集数不符）要么补齐，要么问作者是否改集数。
6. **⛔ 停下等作者确认 bible。** 确认后才交给 `drama-outline`。

## 边界

- 不写剧本台词，不写分镜。梗概写叙述体。
- 不替作者决定题材、集数、结局走向；可以给建议，并说明理由。
- 作者的原话（一句话创意、指定保留的画面）原样保留在 bible 里，不改写成你的版本。
