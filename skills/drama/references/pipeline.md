# 管线与路由

## 阶段与文件

| 阶段 | 文件 | 契约 | 产出它的 skill | 状态 |
| --- | --- | --- | --- | --- |
| 项目 | `project.json` | `contracts/project.schema.json` | `drama`（`dh init`） | M0 已实现 |
| 故事设定 | `story/bible.md` | 无（Markdown） | `drama-idea` | M1 |
| 正文 | `story/chapters/`、`story/tracking/` | 待定 | `drama-write` | M6 |
| 分集大纲 | `outline.json` | `contracts/outline.schema.json` | `drama-outline`、`drama-adapt` | 契约 M0，skill M1 |
| 剧本 | `script.json` | `contracts/script.schema.json` | `drama-script` | 契约 M0，skill M1 |
| 角色 | `cast.json` | 待定 | `drama-cast` | M2 |
| 场景与道具 | `art.json` | 待定 | `drama-art` | M2 |
| 分镜 | `storyboard.json` | 待定（ShotSpec） | `drama-storyboard` | M2 |
| 提示词 | `prompts/<model>/` | 各适配器 | `drama-prompt` | M3 |
| 生成与台账 | `assets/`、`assets/registry.json` | 待定 | `drama-gen` | M4 |
| 验收与返修 | `qc/` | 待定 | `drama-qc` | M5 |

## 三种写文入口

```
idea   一句话创意 → drama-idea（bible.md）→ 作者确认 → drama-outline → outline.json
novel  已有小说   → drama-adapt → outline.json
serial 长篇连载   → drama-write（正文 + 追踪）→ drama-outline（按卷或按段分批）→ outline.json
```

`project.json` 的 `source.kind` 决定入口；`dh status` 据此给出建议。

## 质量门

| 编号 | 阶段 | 级别 | 检查 |
| --- | --- | --- | --- |
| X0 | 任意 | 错误 | 阶段文件缺失 |
| X1 | 任意 | 错误 | 上游文件缺失或未通过 |
| X2 | 任意 | 错误 | JSON 无法解析 |
| P1 | project | 错误 | 符合 schema |
| P2 | project | 错误 | 单集时长 min 不大于 max |
| O1 | outline | 错误 | 符合 schema |
| O2 | outline | 错误 | 角色、场景、道具 id 各自不重复 |
| O3 | outline | 错误 | 集号从 1 起连续 |
| O4 | outline | 错误 | 集数等于 `project.format.episodes` |
| O5 | outline | 错误 | 每集引用的角色、场景、道具都存在 |
| O6 | outline | 错误 | 除最后一集外，结尾钩子不能为空 |
| O7 | outline | 错误 | 至少一个主角 |
| O8 | outline | 警告 | 有角色或叙事道具未出现在任何一集 |
| S1 | script | 错误 | 符合 schema |
| S2 | script | 错误 | 集号与大纲一致 |
| S3 | script | 错误 | 场次 id 不重复 |
| S4 | script | 错误 | 场景存在于大纲 |
| S5 | script | 错误 | 出场角色存在于大纲 |
| S6 | script | 错误 | 台词有说话人，且说话人在本场出场角色里 |
| S7 | script | 错误 | 单集估算时长在 `episodeSeconds` 区间内 |
| S8 | script | 警告 | 场景或角色未列入大纲对应一集 |

## 时长估算

- 台词与旁白：中文按字数（不计标点和空格）除以 `speech.charsPerSecond`，默认 4.5；英文按词数，默认 2.5。
- 动作：默认 `speech.defaultActionSeconds`，默认 2 秒。
- 任何节拍写了 `seconds` 就用它，不再估算。
