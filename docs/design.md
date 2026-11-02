# 短剧创作 Harness 设计稿 v0.1（草案）

日期：2026-11-02
状态：草案，待确认仓库位置与短剧制作平台接口

## 1. 目标

做一个由 Agent 调用的 skill 集合包，辅助短剧创作的全流程：

```
写文（原创 / 改编 / 长篇连载） → 分集大纲 → 剧本 → 资产设定（角色 / 场景 / 道具）
  → 分镜 → 各模型提示词 → 生成（ComfyUI CLI / 云端 API / 自研短剧平台） → 验收与返修
```

宿主：Claude Code、Codex 等能读 `SKILL.md`、能跑脚本的 Agent。
生成目标：MiniMax H3、Seedance、可灵、本地 ComfyUI、GPT Image、Nano Banana、自研短剧制作平台。

## 2. 参考来源与取舍

策略：自研统一数据契约与管线；方法内化进 `references/`，注明来源；局部脚本按许可证复用（shuohao Apache-2.0 需保留 NOTICE；oh-story、程一镜 MIT 需保留版权声明）。

| 来源 | 取什么 | 不取什么 |
| --- | --- | --- |
| oh-story-claudecode | 文件系统当记忆（状态卡、伏笔表、未完承诺）；写前、写后检查；去 AI 味三层法；扫榜和拆文方法；宿主部署脚本思路 | 网文平台发布、扫榜爬虫（与短剧无关，后期再议） |
| shuohao-skills | 小说到短剧的改编五件套；节拍认领、台词时长折算；角色、美术、站位、分镜的 JSON 契约与脚本质量门；评审报告；参考图锚点与过期标记 | 各 skill 分别维护契约（我们改为一套共享契约） |
| cheng-yi-jing-skill | Shot Card；按模型的提示词体检器（lint + 正例和反例 fixture）；PASS / HOLD / BLOCKED 三态；单主因返修；职责边界写死 | 只绑定 H3 一个模型 |

## 3. 核心设计决定

1. **一个项目目录就是全部状态。** 所有阶段的产物落成文件，换会话、换宿主都能续跑。Agent 不靠对话记忆。
2. **一套共享契约，模型无关的中间表示。** 分镜阶段产出模型无关的 `ShotSpec`；各模型的提示词由适配器从 `ShotSpec` 编译，不在分镜里写死某个模型的格式。
3. **质量门由脚本判定。** 模型不能自己宣布“通过”。每个阶段有 `validate`，退出码 0 / 1 / 2。
4. **人工确认点固定。** 故事设定、分集大纲、角色定妆、分镜、付费生成前，这五处必须等用户确认。
5. **职责边界写死。** 不擅自改剧情、台词、人物、时长、预算；平台参数未知就写“待确认”，不编造。
6. **一个 CLI，多个 skill。** 共享逻辑放在零依赖 Node CLI（Node 22 及以上）里；skill 只写流程、判断和边界。构建时把共享文件复制进每个 skill，保证单个 skill 拷走仍能运行（参照 oh-story 的“复制不用软链”决定）。

## 4. 项目目录（一个短剧一个目录）

```
<剧名>/
  project.json            剧名、集数、单集时长、画幅、目标模型、预算、语言
  story/                  写文产物
    bible.md              故事设定：题材、卖点、人设、世界观
    source/               改编时导入的小说原文
    chapters/             正文（原创或连载）
    tracking/             状态卡、伏笔表、未完承诺（长篇连载用）
  outline.json            分集大纲：梗概、爽点表、钩子、资产清单（三种入口在此汇合）
  script.json             剧本：场次 + 节拍（动作与台词交替），逐集时长
  cast.json               角色：画像、形象提示词、音色提示词、锁定版本
  art.json                场景与道具：一致性锚点、状态变体
  storyboard.json         段 → 镜（ShotSpec），每镜认领剧本节拍
  prompts/<model>/        各模型提示词（由适配器编译，不手改）
  assets/registry.json    资产台账：每个文件的来源、版本、所用提示词、是否过期
  qc/                     生成后验收记录与返修 diff
  reports/                HTML 评审报告（可重新生成，不进版本控制）
```

## 5. Skill 列表

| Skill | 做什么 | 输入 | 输出 |
| --- | --- | --- | --- |
| `drama` | 总入口：判断当前项目处于哪一步、下一步该调哪个 skill；创建项目 | 用户需求 | `project.json`、路由建议 |
| `drama-idea` | 一句话创意到故事设定：题材、卖点、人设、核心冲突、梗概 | 一句话 | `story/bible.md` |
| `drama-adapt` | 导入已有小说，按短剧逻辑改编 | 小说原文 | `outline.json` |
| `drama-write` | 写正文，带状态卡和伏笔追踪；适用于原创短篇和长篇连载 | `bible.md` 或已有正文 | `story/chapters/`、`story/tracking/` |
| `drama-deslop` | 去 AI 味：表达、叙事用笔、故事因果三层 | 正文 | 修订后正文与诊断 |
| `drama-outline` | 正文或设定转分集大纲：爽点、钩子、资产清单 | 正文或 `bible.md` | `outline.json` |
| `drama-script` | 分集大纲转剧本：场次、节拍、台词、时长折算 | `outline.json` | `script.json`、台词本 |
| `drama-cast` | 角色设定：画像、形象提示词、音色提示词 | `outline.json`、`script.json` | `cast.json` |
| `drama-art` | 场景与道具设定 | `outline.json`、`script.json` | `art.json` |
| `drama-storyboard` | 剧本转分镜：段与镜、景别、运镜、站位、参考图挂载 | `script.json`、`cast.json`、`art.json` | `storyboard.json` |
| `drama-prompt` | 把 `ShotSpec` 和资产设定编译成各模型提示词，并逐模型体检 | `storyboard.json` 等 | `prompts/<model>/` |
| `drama-gen` | 执行生成：ComfyUI CLI、云端 API、自研短剧平台；登记资产台账 | `prompts/`、`project.json` | `assets/`、`registry.json` |
| `drama-qc` | 生成后验收；单主因返修（一次只改一个变量，记录前后差异） | 生成结果 | `qc/` |

三种写文入口如何汇合：

```
一句话创意 → drama-idea → drama-write(可选，先写短篇正文) → drama-outline ┐
已有小说   → drama-adapt ─────────────────────────────────────────────────┤→ outline.json → 后续统一
长篇连载   → drama-write(连载 + 追踪) → drama-outline(按卷/按段分批) ─────┘
```

## 6. 模型适配器

每个适配器包含三样东西：编译器（`ShotSpec` 到该模型格式）、体检器（格式、长度、语言边界、参数范围）、fixture（至少一份应通过、两份应失败）。

| 适配器 | 类型 | 首版要点 |
| --- | --- | --- |
| `h3` | 视频 | Ref2VA 六段式与 I2VA 两种模式；`<d>` 台词块；参考图 Picture N 映射 |
| `seedance` | 视频 | 首尾帧、参考图、时长档位 |
| `kling` | 视频 | 首尾帧、运镜、多图参考 |
| `comfyui` | 图像与视频 | 工作流 JSON 模板加参数注入，通过 ComfyUI CLI 提交 |
| `gpt-image` | 图像 | 角色、场景、道具设定图与分镜图 |
| `nano-banana` | 图像 | 多图参考编辑，保持角色一致性 |
| `platform` | 自研平台 | 待定：导出包格式或 API 推送 |

各模型的平台参数（时长档位、分辨率、参考图上限）写在适配器的配置里；不知道的值标“待确认”。

## 7. CLI（暂名 `dh`）

```
dh init <剧名>                    创建项目目录与 project.json
dh status                         各阶段完成度、过期资产、下一步建议
dh validate <stage>               跑该阶段质量门，退出码 0 / 1 / 2
dh render <stage>                 生成 HTML 评审报告
dh compile --model <m>            ShotSpec 编译为指定模型提示词
dh lint --model <m> <file>        体检单条提示词
dh gen --target <t> [--dry-run]   提交生成；dry-run 只列清单和预估费用
dh registry                       资产台账：版本、来源、过期标记
dh doctor                         检查 Node、ComfyUI CLI、API key 等依赖，只报告不安装
```

## 8. 里程碑

| 阶段 | 内容 | 验收 |
| --- | --- | --- |
| M0 | 共享契约（JSON Schema）、CLI 骨架、`drama` 入口、样例项目 | `dh init` + `dh validate` 在样例上跑通，CI 绿 |
| M1 | 文字链路：`drama-idea` → `drama-outline` → `drama-script`，加 `drama-adapt` | 样例从一句话走到 `script.json`，全部质量门通过 |
| M2 | 资产与分镜：`drama-cast`、`drama-art`、`drama-storyboard` | 样例出 `storyboard.json`，节拍认领与时长门通过 |
| M3 | 提示词：`drama-prompt` + `h3`、`gpt-image` 适配器，随后补其余适配器 | 每个适配器 fixture 正反例结果正确 |
| M4 | 生成：`drama-gen` 接 ComfyUI CLI 和云端 API，资产台账 | 样例一集真实出图出视频，台账可追溯 |
| M5 | 自研短剧平台适配器、`drama-qc` 返修闭环 | 平台侧能收到并识别导出包 |
| M6 | 长篇连载追踪、`drama-deslop` | 连载 20 章样例可分批转剧本 |

## 9. 待确认

1. 仓库名与位置（建议 `D:\projects\drama-harness`，GitHub `2233admin/drama-harness`）。
2. 自研短剧制作平台：仓库位置、接收格式（导出包还是 API）、鉴权方式。
3. ComfyUI CLI 指哪个：官方 `comfy-cli`，还是自己的封装；本机 ComfyUI 的工作流目录。
4. 云端模型走哪个 API 网关（直连各厂商，还是统一中转）。
5. 单集时长与画幅的默认值。
