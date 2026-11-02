# 管线与路由

## 阶段与文件

| 阶段 | 文件 | 契约 | 产出它的 skill | 状态 |
| --- | --- | --- | --- | --- |
| 项目 | `project.json` | `contracts/project.schema.json` | `drama`（`dh init`） | M0 已实现 |
| 故事设定 | `story/bible.md` | Markdown，五个固定章节 | `drama-idea` | M1 已实现 |
| 小说原文 | `story/source/index.json` | `contracts/source.schema.json` | `drama-adapt`（`dh import`） | M1 已实现 |
| 正文 | `story/chapters/`、`story/tracking/` | 待定 | `drama-write` | M6 |
| 分集大纲 | `outline.json` | `contracts/outline.schema.json` | `drama-outline`、`drama-adapt` | M1 已实现 |
| 剧本 | `script.json` | `contracts/script.schema.json` | `drama-script` | M1 已实现 |
| 角色 | `cast.json` | `contracts/cast.schema.json` | `drama-cast` | M2 已实现 |
| 场景与道具 | `art.json` | `contracts/art.schema.json` | `drama-art` | M2 已实现 |
| 分镜 | `storyboard.json` | `contracts/storyboard.schema.json`（ShotSpec） | `drama-storyboard` | M2 已实现 |
| 提示词 | `prompts/<model>/` | 各适配器 | `drama-prompt` | M3 |
| 生成与台账 | `assets/`、`assets/registry.json` | 待定 | `drama-gen` | M4 |
| 验收与返修 | `qc/` | 待定 | `drama-qc` | M5 |

## 三种写文入口

```
idea   一句话创意 → drama-idea（bible.md）→ 作者确认 → drama-outline → outline.json
novel  已有小说   → dh import（story/source/）→ drama-adapt → outline.json
serial 长篇连载   → drama-write（正文 + 追踪，M6）→ drama-outline（按卷或按段分批）→ outline.json
```

`project.json` 的 `source.kind` 决定入口，也决定大纲的上游门：

| source.kind | 大纲的上游 | 路径上的阶段 |
| --- | --- | --- |
| `idea` | project、bible | project → bible → outline → script → cast → art → storyboard |
| `novel` | project、source | project → source → outline → script → cast → art → storyboard |
| `serial` | project | project → outline → script → cast → art → storyboard（导入过原文时加 source） |

角色和美术只依赖大纲，可以和剧本同时做；分镜依赖剧本、角色、美术，并且要求角色已锁定。

`dh status` 按这条路径找第一个没通过的阶段，给出下一步。分镜可以分批：只覆盖部分集数时 K13 给警告，`dh status` 会建议继续分镜剩下的集。

## 质量门

| 编号 | 阶段 | 级别 | 检查 |
| --- | --- | --- | --- |
| X0 | 任意 | 错误 | 阶段文件缺失 |
| X1 | 任意 | 错误 | 上游文件缺失或未通过 |
| X2 | 任意 | 错误 | JSON 无法解析 |
| P1 | project | 错误 | 符合 schema |
| P2 | project | 错误 | 单集时长 min 不大于 max |
| B1 | bible | 错误 | 五个章节齐全且不为空（只有占位行算空） |
| B2 | bible | 警告 | 梗概编号条数与集数不符 |
| N1 | source | 错误 | 符合 schema |
| N2 | source | 错误 | 章号从 1 起连续 |
| N3 | source | 错误 | 章节文件存在，字数与索引一致（原文被改过要重新导入） |
| O1 | outline | 错误 | 符合 schema |
| O2 | outline | 错误 | 角色、场景、道具 id 各自不重复 |
| O3 | outline | 错误 | 集号从 1 起连续 |
| O4 | outline | 错误 | 集数等于 `project.format.episodes` |
| O5 | outline | 错误 | 每集引用的角色、场景、道具都存在 |
| O6 | outline | 错误 | 除最后一集外，结尾钩子不能为空 |
| O7 | outline | 错误 | 至少一个主角 |
| O8 | outline | 警告 | 有角色或叙事道具未出现在任何一集 |
| O9 | outline | 错误 | 连续没有爽点的集数不超过 `rules.maxPayoffGap`（默认 3） |
| O10 | outline | 错误 | 梗概不得出现引号对白 |
| O11 | outline | 错误 | 改编项目必须写 adaptation；非忠实改编至少砍掉一样 |
| O12 | outline | 错误 | 保留取舍的证据逐字出现在原文里，且至少一条 |
| O13 | outline | 错误 | 改编项目每集写 source.chapters，范围合法 |
| O14 | outline | 警告 | 某集起始章早于上一集（倒叙需确认） |
| O15 | outline | 警告 | 叙事道具超过 8 件 |
| S1 | script | 错误 | 符合 schema |
| S2 | script | 错误 | 集号与大纲一致 |
| S3 | script | 错误 | 场次 id 不重复 |
| S4 | script | 错误 | 场景存在于大纲 |
| S5 | script | 错误 | 出场角色存在于大纲 |
| S6 | script | 错误 | 台词有说话人，且说话人在本场出场角色里 |
| S7 | script | 错误 | 单集估算时长在 `episodeSeconds` 区间内 |
| S8 | script | 警告 | 场景或角色未列入大纲对应一集 |
| S9 | script | 错误 | `hookBeat` 落在全集前 `rules.hookWindow` 拍内（默认 3） |
| S10 | script | 错误 | 单句台词或旁白不超过 `rules.maxLineUnits`（中文 35 字，英文 25 词） |
| S11 | script | 错误 | 每场至少一拍动作 |
| S12 | script | 错误 | 动作节拍不夹引号台词 |
| S13 | script | 警告 | 单集旁白超过 `rules.maxVoiceoverPerEpisode` 条（默认 3） |
| S14 | script | 警告 | 连续台词超过 `rules.maxConsecutiveDialogue` 句（默认 4） |
| C1 | cast | 错误 | 符合 schema |
| C2 | cast | 错误 | 角色与大纲一一对应：不缺、不多、不重复 |
| C3 | cast | 错误 | 每个外形锚点的英文短语都写进了 imagePrompt |
| C4 | cast | 错误 | 提示词字段（出图、服装、锚点、音色）是英文 |
| C5 | cast | 错误 | imagePrompt 不含人名和剧名 |
| C6 | cast | 错误 | 服装 id 不重复，默认服装存在 |
| C7 | cast | 警告 | 角色还没锁定（分镜前必须锁定） |
| A1 | art | 错误 | 符合 schema |
| A2 | art | 错误 | 场景与大纲一一对应；大纲的叙事道具都有设定；不出现大纲外的 id |
| A3 | art | 错误 | 年代写具体，不写「古代」「架空」这类含糊词 |
| A4 | art | 错误 | 每个锚点的英文短语都写进了 imagePrompt |
| A5 | art | 错误 | 提示词字段（出图、锚点、状态）是英文 |
| A6 | art | 错误 | 提示词不含人名和剧名；场景提示词写明空景 |
| A7 | art | 错误 | 同一场景或道具的状态 id 不重复 |
| K1 | storyboard | 错误 | 符合 schema |
| K2 | storyboard | 错误 | 集号存在于剧本，不重复、不倒序 |
| K3 | storyboard | 错误 | 段的场次属于该集、按剧本场次顺序排；段 id 和镜 id 不重复 |
| K4 | storyboard | 错误 | 每场节拍按顺序被镜头认领，不重不漏 |
| K5 | storyboard | 错误 | 单镜秒数在 `rules.minShotSeconds`–`rules.maxShotSeconds`（默认 1.5–8）；单段不超过 `rules.maxSegmentSeconds`（默认 15） |
| K6 | storyboard | 错误 | 认领的台词装得进镜头秒数 |
| K7 | storyboard | 错误 | 主体在本场出场角色里；指定的服装存在 |
| K8 | storyboard | 错误 | 场景状态和道具在 art.json 里存在 |
| K9 | storyboard | 错误 | cast.json 已锁定 |
| K10 | storyboard | 错误 | 首帧画面点名每个主体（用于对应参考图） |
| K11 | storyboard | 错误 | 镜头正文不出现人名（视频模型要求用通用身份） |
| K12 | storyboard | 警告 | 每集第一镜没有人物 |
| K13 | storyboard | 警告 | 剧本里还有集没有分镜 |

## 时长估算

- 台词与旁白：中文按字数（不计标点和空格）除以 `speech.charsPerSecond`，默认 4.5；英文按词数，默认 2.5。
- 动作：默认 `speech.defaultActionSeconds`，默认 2 秒。
- 任何节拍写了 `seconds` 就用它，不再估算。
