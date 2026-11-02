---
name: drama-script
version: 0.1.0
description: |
  按分集大纲写短剧剧本 script.json：场次加节拍流（动作、台词、旁白交替），逐集按语速估算时长，
  开场钩子必须落在前 3 拍，单句台词一口气说得完，动作只写 AI 视频常见的动作。
  时长、钩子位置、说话人、动作与台词边界等由 dh validate script 检查。
  Use when asked to 写剧本、出剧本、分场、台词、script。
triggers:
  - drama-script
  - 写剧本
  - 出剧本
  - 分场
  - 台词
---

# drama-script：剧本

输入：已确认的 `outline.json`。
输出：`script.json`，通过 `dh validate script`。

契约：`contracts/script.schema.json`。方法细则：[references/script-method.md](references/script-method.md)，动笔前先读。

## 流程

1. **跑 `dh status`。** 大纲没通过，剧本门会报 X1，先回上游。
2. **小批量写。** 默认一批不超过 3 集。剧本是全管线改得最多的一层：小批写、快确认、再往下写。
3. **每集写之前先拿齐：** 这一集的梗概、开场钩子、结尾钩子、爽点；出场人物的 `summary`（决定谁怎么说话）；上一集的结尾钩子（开场要接住）；单集时长区间（`project.format.episodeSeconds`）。
4. **写场次和节拍。** 每集写 `hookBeat`：开场钩子落在全集第几拍（从 0 开始数）。
5. **跑 `dh validate script`，修到通过。** 写超了先砍动作节拍再压台词；写短了补冲突，不补寒暄。用 `dh status` 看每集估算秒数。
6. **把这一批交给作者看，** 再写下一批。

## 边界

- 不改大纲定下的剧情、人物、结局。写的时候发现大纲有问题，停下来告诉作者，回 `drama-outline` 改，不在剧本里偷偷改。
- 只用大纲清单里的人物和场景（S4、S5）。需要新人物或新场景，先回大纲加。
- 不写运镜、景别、画面构图；那是分镜阶段的事。
