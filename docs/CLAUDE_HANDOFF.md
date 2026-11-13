# Claude Code 完整交接

> 历史交接快照。2026-11-13 用户已要求立即恢复圣诞首页，取代本文当时的 12 月 25 日日期切换。当前入口、图标和小猫状态以 [恢复记录](RESTORATION_2026_11_13.md)、[SEASONAL_SITE.md](SEASONAL_SITE.md) 和当前源码为准；新电影的未完成状态未变。

更新：**2026-11-12**。用户要求“先把所有进展推到 GitHub repo，之后让 Claude Code 继续”。视频生成暂停；本次没有新部署或 DNS 修改任务。本文件区分已上线成果、制作计划、历史检查和当前未完成事项。

## 1. 接手时先区分三件事

| 工作 | 交接时实际状态 |
| --- | --- |
| 已有告白网站 | Sites v26；旧影片去纸鸟重剪后 203 秒，随后 90 秒交互尾声，总计 293 秒，约 4:53 |
| 圣诞照片树 | 保留独立 `/christmas/`；95 张原照片、八方向背景、骨骼小猫、高清查看器、可选手势等代码和素材 |
| 新电影《今晚，改道》 | 已批准的导演方案、参考图、生成队列；目标 322 秒 / 5:22，**0 条生成片段、0 条验收片段，未剪辑、未接入** |

旧片和烟花尾声不能算作新电影完成。计划时长、提示词、参考静帧、Google Vids 默认空白场景都不是生成成功的证据。

交接源码基线为 `2abfef734dab07d8279e04ac35b981bcb8bb2287`，对应已发布 Sites v26。目标为 [yil384/christmas-tree](https://github.com/yil384/christmas-tree) 的 `handoff/claude-2026-11-12` 分支，承接旧 `codex/christmas-gift-redesign` 历史并保存当前完整快照。最终提交与远端可见性以实际推送后的核验为准。

同日上一次准备生成了本地提交 `ad81a9f0374bf37bd15a10cb3219d823e6ca8b13`，但 GitHub 写入登录未完成。设备码过期后发现临时目录已重置，当前交接从持久的 Sites 源码和电影制作包重新恢复。**不能把这个已失去本地副本的 SHA 或上次 sandbox 下载链接当作 GitHub 已保存的证据。** 恢复后重新提交会产生新的 SHA。

交接前已读取的 GitHub 分支如下。保留它们，不自动覆盖或合并：

| 分支 | 交接前提交 |
| --- | --- |
| `main` | `844295431c728a315494ba59c9601572e7fcf818` |
| `codex/christmas-gift-redesign` | `4af42e828c3d955484832f9488bea4a246578ccd` |
| `gh-pages` | `8c0cd2152d81a7d607bcfb75345b9a053442e5e9` |

## 2. 当前入口与季节切换

| 地址 | 行为 |
| --- | --- |
| [主域名](https://tanchensiyi.com/) | 北京时间 2026-12-25 00:00 前选择告白，之后选择圣诞树 |
| [/letter/](https://tanchensiyi.com/letter/) | 固定告白入口 |
| [/christmas/](https://tanchensiyi.com/christmas/) | 固定圣诞树入口 |
| [旧礼物域名](https://jimeixiaomiao.wildmole.chatgpt.site/) | 首页固定圣诞树；显式路线优先 |

代码链是 `src/main.tsx` → `src/SeasonalEntry.tsx` → `src/lib/experience-route.ts`。告白懒加载 `src/journey/CastleRide.tsx`，圣诞懒加载 `src/App.tsx`。`src/confession/ConfessionPage.tsx` 是旧实现，不是当前首页。

路由优先级是显式 `/christmas` → 显式 `/letter` → 旧域名 → 日期。`CHRISTMAS_LAUNCH` 为 `2026-12-25T00:00:00+08:00`；页面聚焦、前进后退、恢复可见时重新判断，切换前有不超过一天的检查定时器。届时不需要修改 DNS。

已有一次性巡检自动任务 `Automation_4dca7edb9e40819190ebcdb7e52334ca`，时间为 Asia/Shanghai 的 2026-12-25 00:00。它不随 Git 克隆迁移；不要因为 Claude Code 中看不到就重复建立。日期切换由前端完成，任务用于检查与必要修复。历史域名记录见 [SEASONAL_SITE.md](SEASONAL_SITE.md)；本轮没有重新审计 `www` 或 DNS。

## 3. 现有告白体验

### 播放与交互

- 页面和样式：`src/journey/CastleRide.tsx`、`CastleRide.css`。
- 播放：`useRidePlayback.ts`；当前入口 `journey/film/index-birdfree-r1.m3u8`，按能力选择原生 HLS 或 hls.js / MSE，包含有界恢复与诊断状态。
- 视频初始为 `preload="none"`、`playsInline`，封面 `journey/cover.webp`；启动后才准备媒体。保留用户点击开播与开声路径。
- 时间与热点：`rideTimeline.json`、`rideHotspots.ts`、`mapRideHotspots.ts`；公开副本 `public/journey/film/timeline.json`。
- 尾声：`rideSequenceConfig.ts`、`useRideSequence.ts`、`useFinaleSound.ts`、`finale/`，Three.js 与 Canvas 降级使用同一演出时序，音轨 `journey/finale-score.m4a`。
- 告白：`RideConfession.tsx`，明确“谭陈思仪 / 我喜欢你。 / 要不要和我在一起？”，并保留“马来西亚那趟，我一直记着。”回答只影响本地体验，不上报。

`useFinaleSound` 的历史修复在媒体出现 `[0,0]` 可寻址区间时，临近尾声缓存完整 M4A Blob。继续改动要检查回放、暂停、重置、后台恢复及音画时序，不能只检查文件能下载。

### 当前去鸟修订

依据 [LONG_RIDE_BIRD_REMOVAL_REPORT.json](LONG_RIDE_BIRD_REMOVAL_REPORT.json)、当前源码/公开时间轴及 HLS，修订为 `birdfree-r1`：

| 项目 | 当前值 |
| --- | --- |
| 原片 | 228.5 秒 |
| 删除范围 | 旧时间轴 `[88.5, 114.0)`，镜头 8、9，共 25.5 秒 / 612 帧 |
| 当前影片 | 203 秒，24 fps，4,872 帧 |
| 保留镜头 | 1–7 和 10–18，共 16 段 |
| 热点 | 16 个；7 个时间不变，9 个前移 25.5 秒 |
| HLS | 720×1280 与 1080×1920，各 34 个片段 |
| 尾声 / 总体验 | 90 秒 / 293 秒 |

88.5 秒处为硬切，其余过渡保留。该工作只有删段重剪，没有生成新剧情、延长片长、重复、定格或改速。旧 [LONG_RIDE_BUILD_REPORT.json](LONG_RIDE_BUILD_REPORT.json) 的 228.5 秒、318.5 秒属于较早版本。

报告记载人工查看删除边界新帧 2123 / 2124（旧帧 2123 / 2736），该处未见纸鸟。**没有全片逐帧无鸟或全音轨无鸟叫的完整验收证据**；修订名称也不是保证。

### 验证局限

[LONG_RIDE_QA.md](LONG_RIDE_QA.md)、[LONG_RIDE_FINALE.md](LONG_RIDE_FINALE.md) 包含历史桌面媒体、尾声、告白弹窗和 390×760、440×956 视口检查。部分环境禁用 WebGL，只能检查 Canvas 路径。

这些不能等同于真实 iPhone 17 Pro Max、微信内浏览器、硬件 GPU、摄像头识别或手机帧率验收。用户对人物相似度、剧情、猫的自然度、画面新意和加载仍不满意，不能将既有技术检查写成用户认可成品。

## 4. 圣诞树：成果与持续问题

- `src/App.tsx` 管理场景、相册、分享、手势与可选影片；场景代码在 `src/scene/`。
- `public/photos/manifest.json` 包含 **95 张**原图，封面 `Image_2026-11-07_040144_237.jpg`；原文件在 `public/photos/`，来源见 [PHOTO_SOURCES.md](PHOTO_SOURCES.md)。不删除、重绘或替换原照来修复渲染。
- 准备脚本生成共享图集、缩略图、按需高清图；图集完整解码后整批显示，减少逐张加载。高清查看器支持缩放和拖动。
- 背景为八张方向画与兜底全景，通过透视方向拼接，仍是画作，不是完整三维城堡。树、地面、背景固定在世界空间，由相机环绕和光学缩放，当前约 120 秒同方向一圈。见 [multiview-background.md](multiview-background.md)。
- 小猫为 `src/assets/christmas-cat.glb` 骨骼模型，含 Idle / Walking 混合、路线、眨眼和接触阴影。代码存在不等于观感自然，来源见 [THIRD_PARTY.md](THIRD_PARTY.md)、[CAT_MODEL_OPTIONS.md](CAT_MODEL_OPTIONS.md)。
- 手势模式仅在主动开启时请求摄像头，本机推理，退出或后台释放，不请求麦克风；触摸始终可用。见 [HAND_MAGIC.md](HAND_MAGIC.md)。

### 圣诞影片配置纠正

`public/scene.json` 当前 `cat.image` 是 `characters/christmas-cat.png`，`cat.video` 是 **`videos/starlight-return.mp4`**。旧 README 中“`cat.video: null`、没有影片入口”已失效。`prepare-scene.mjs` 将 MP4 复制到 `generated/videos/transformation-<hash>.mp4`，`App.tsx` / `ChristmasFilm.tsx` 使用生成配置。整理构建时删除的是重复源 `dist/videos/`，不是生成影片。它也不是新《今晚，改道》的成果。

原 README 技术说明归档为 [CHRISTMAS_TREE_GUIDE.md](CHRISTMAS_TREE_GUIDE.md)，顶部标记过时状态。原 `docs/HD_UPDATE.md` 链接没有对应文件，归档中的链接改用实际存在的 [PERFORMANCE.md](PERFORMANCE.md) 并注明。

用户反复反馈的猫恐怖谷、树与背景脱节、模糊、照片黑屏、首次加载慢均需继续检查。应在真实手机检查图集纹理初始化、WebGL 恢复、旋转/缩放一致性、高清照片、低速网络和猫爪接地。数学测试或离屏图片只能覆盖各自技术条件。

## 5. 新电影《今晚，改道》

恢复入口：[production/tonight-we-change-course/README.md](../production/tonight-we-change-course/README.md)；实际记录：[ATTEMPTS.md](../production/tonight-we-change-course/ATTEMPTS.md)、[progress.json](../production/tonight-we-change-course/progress.json)。导演包在 [malaysia-film/README.md](malaysia-film/README.md)，不要从旧两分钟圣诞片提示词重新开始。

| 文件 / 位置 | 内容 |
| --- | --- |
| [DIRECTOR_SCRIPT.md](malaysia-film/DIRECTOR_SCRIPT.md) | 目标 5:22、22 段剧情的导演稿 |
| [VIDS_PROMPTS.md](malaysia-film/VIDS_PROMPTS.md) | 29 个明确切镜 prompt，4 组优先真正 Extend |
| [CONTINUITY.md](malaysia-film/CONTINUITY.md) | 人脸、服装、猫、机位、船、榴莲、旅行册连续性 |
| [generation-queue.json](malaysia-film/generation-queue.json)、[SHOT_QUEUE.csv](malaysia-film/SHOT_QUEUE.csv) | 生成顺序及待填写真实输出 |
| [director-cues.json](malaysia-film/director-cues.json) | 计划时间点，最终按实际剪辑校准 |
| [真人原照](film/HUMAN_ORIGINAL.jpg) | 身份真值，不以 AI 公主图替代 |
| [references/](malaysia-film/references/) | 主厅 A、准备间 B、出发平台 C、灰白短毛猫四张参考图 |
| [production 目录](../production/tonight-we-change-course/README.md) | 尝试记录、机器状态、素材校验、6 页故事预览、质量样片工具 |

批准的导演包保持原字节。里面早期登录状态、空输出字段、`actual_extend_call_count: null` 是计划快照，不是当前账本。实际 Extend 为 **0**，登录未验证，进度以 production 最新记录为准。

[当前 Google Vids 工程](https://docs.google.com/videos/d/1xqNPZ0ASqpQNVnWTWnn6-8Jmwpuc7lrp5TaCzxB7_zU/edit?scene=id.p#scene=id.p) 需要用户指定的创作账号登录。用户只使用 Google Vids，不用 Flow。不要把账号、验证码、Cookie、授权跳转或临时签名地址写入仓库。

### 已批准故事与约束

他把城堡约会安排得过分认真，忙着准备却忘了坐到她身边。猫与榴莲让两人从排场回到相处；未完成的旅行册、两把海边空椅、行李引出双方谈过的马来西亚未来愿望，最后共同准备出发并明确表白。用行动、反应和因果推进，不是纯逛城堡。

- 保持原照人物身份、刘海、半扎发和浅蓝花瓣礼服，避免通用公主脸及过度美化。未提供男主脸，采用手、肩背或裁去脸的构图。
- 猫为自然灰白短毛猫，正常解剖、眼鼻比例、四足步态和重量，不用塑料、夸张 Q 版或僵硬站立替代。
- 全片排除鸟、鸡、尖嘴动物、纸鸟、鸟形装饰、飞行动物、鸟叫，逐片实看实听。
- 榴莲是她喜欢的食物，不喂猫。马来西亚是未来愿望，不暗示已经旅行、订票或答应恋爱。
- S01–S15 船始终系同一码头，S16 解缆；石拱通道始终开放，无机械水门。唯一榴莲盘、三瓣果肉、两把勺、银罩、旅行册的转移遵循连续性表。
- 真正 Extend 承接平台实际生成片段。不能延长时，按 29 镜头方案换机位明确切镜，不把两个 Create 冒充一镜到底。
- 正常速度的合格剧情至少 300 秒。循环、定格、推拉、慢放、等待点击和烟花停留不补片长。彩蛋可选，不点击也能看完整故事。
- 结尾明确“谭陈思仪，我喜欢你。要不要和我在一起？”，随后邀请“马来西亚那趟，我想和你一起去。”真实回答留给本人。

### 实际生成尝试

| 日期（America/Los_Angeles） | 证据支持的情况 |
| --- | --- |
| 2026-11-10 首次 | S02 动作样片；界面 Omni、9:16、1080p、3 秒、三张参考；额度拒绝 |
| 2026-11-10 23:47 | 手动再试，额度拒绝 |
| 2026-11-11 10:30 | 手动再试，额度拒绝 |
| 2026-11-12 | 登录失效，安全登录请求超时；没有提交生成，没有当天额度验证 |

失败文字为 `You've hit your limits for generating videos in Vids.`。时长滑块禁用并停在 3 秒，切换分辨率未解除，原因未知。该 3 秒动作样片不能替代 S02 计划剧情时长。界面显示 Omni，不能写成已确认用 Veo。

此前“一小时后再试”的自动任务只有执行记录和需要用户处理标记，没有可核实产物，不计入请求或完成数。本次用户选择交接，没有持续后台生成任务。

2026-11-12 查阅的 [Google Vids 官方说明](https://support.google.com/docs/answer/16143507?hl=en) 写明相关月额度每月 1 日太平洋时间 00:00 重置，Google AI Pro / Ultra 家庭共享可能共用额度。**只有该账号确实耗尽这种月额度时**，下周期才可条件性推算为 2026-12-01 00:00 PST。套餐、使用量、共享状态未核实，官方一般规则不是账号状态查询，不承诺一小时或某日必然恢复。

## 6. 构建、验证与缺失输入

Node.js ≥20.19，CI 使用 24。按 [CONTRIBUTING.md](../CONTRIBUTING.md) 在根目录执行：

```bash
npm ci
npm run lint
npm test
npm run build
npm run preview
```

`test` 执行 `tests/*.test.mjs` 与 `src/hand-tracking/*.test.mjs`。`predev` / `prebuild` 自动准备照片、场景与手势资源；忽略的 `public/generated/` 不随源码提交，首次手势模型下载需要联网且校验内容。不要跳过准备步骤掩盖网络或缺失原素材错误。

`build` 执行 TypeScript、Vite、`scripts/finalize-build.mjs`。整理仅操作 `dist/` 明确路径，去掉重复源照片、背景、人物、视频及历史页面素材，保留所需生成资源和当前影片，建立 `/letter/index.html`、`/christmas/index.html`。生产预览应测试两条路径直接访问与刷新。

### 本次恢复后的实际检查

2026-11-12 恢复当前源码并重新应用检查配置修复后，在 Node.js **24.22.1** 环境完成实际复验：

| 检查 | 本次结果 |
| --- | --- |
| `npm run build` | **通过**；照片、场景、手势资源准备、TypeScript、Vite、最终静态入口整理全部完成 |
| `npm test` | **244 通过，0 失败** |
| `npm run lint` | 退出 0，**0 错误，4 个既有 Hook 警告** |
| 四份交接文档相对链接 | 64 个均能在恢复源码及交接文件中解析 |

检查配置修复包括：ESLint 排除 `public/journey/film/**/*.ts` MPEG-TS 视频片段；透视背景测试的数据 URL 模块加载器补上 `./tree-profile` 映射。运行时代码没有因此修改。Hook 警告位于 `ConfessionPage.tsx`、`CastleRide.tsx`、`useRidePlayback.ts`、`PhotoOrnaments.tsx`。

以上是本次恢复后新执行的检查结果，均已确认完成，不是沿用上次临时快照的结果。没有新增 GitHub CI 或真实 iPhone 微信验证，视觉质量仍需实测。

为避免交接只存在于临时目录，本轮计划先将恢复后的交接保存到既有 Sites 源码 Git，**只保存源码，不部署网站**，然后完成 GitHub 授权和推送。保存、推送及远端分支状态均以实际返回和重新读取的提交为准；本段不宣称已完成远端保存。

### 影片再制作与缺失输入

普通网页构建直接使用已入库 HLS，不要求重编码影片。重新剪辑才需 Python、FFmpeg、ffprobe；先读 [LONG_RIDE_VIDEO_PIPELINE.md](LONG_RIDE_VIDEO_PIPELINE.md) 和新片 production 工具说明。

上次审计确认，全部六个 HLS 清单引用的运行分片、优化图片、95 张圣诞原照、新片真人和四张场景/猫参考齐全。但 [LONG_RIDE_CLIP_PROVENANCE.json](LONG_RIDE_CLIP_PROVENANCE.json) 中 **18 条旧 `clip-*.mp4` 原始镜头**、[LONG_RIDE_ASSETS.md](LONG_RIDE_ASSETS.md) 旧绝对路径指向的**原始旅程 PNG** 未入库。源级重新剪旧片，先从记录的 Google Vids 工程恢复或导出。当前运行素材齐全不等于原剪辑工作区完整。

旧 JSON 内的绝对临时路径、无损 master、命令日志位置不可移植，不能当作输入已交付的证据。新片真实源文件、时长、入点、出点、QA 字段等待真正生成、下载、检查后填写。

## 7. Git、发布与媒体传输

- `.github/workflows/check.yml` 在 PR 和 `main` push 运行 lint、test、build；单推交接分支不保证触发。
- `.github/workflows/gift-preview.yml` 针对 `codex/christmas-gift-redesign`，更新 `gh-pages/preview-2026/` 并保留根目录与 CNAME，不发布 Sites 生产。
- `npm run deploy` 是历史 GitHub Pages 命令，不为验证构建执行它。
- `.openai/hosting.json` 保留 Sites 项目 `appgprj_6aef1795eb688191a80ffb20460dbab1`，静态目录 `dist/`。GitHub 源码交接不会自动更新线上。

本轮保持生产 v26。以后发布先完成修改、构建、媒体引用检查和手机验证，以同一提交对应的静态归档部署，再核实版本与域名。不要把源码推送当作网站发布成功。

[SITES_MEDIA_DELIVERY.md](SITES_MEDIA_DELIVERY.md) 记录该源码服务单次推送 64 MiB 限制。大素材分批引入但避免发布中间状态；移动已上传二进制前评估本地 `pack.useSparse false`。历史同一提交组 sparse pack 为 151,608,557 字节，非 sparse 约 10,087,071 字节。这是该服务经验，不是 GitHub 通用文件限制，不需要改权限或重写历史。

新高码率影片接入前重算 `dist/`、托管上限、首屏请求与手机网络成本，避免把多份无损 master 与源图重复发布。源码保留原照片和人脸参考，运行派生资源按实际需要生成。

不提交密码、验证码、令牌、Cookie、私密会话 URL、完整登录记录或签名临时地址。个人照片用于已授权礼物项目，不额外扩散、改仓库可见性或上传图床。告白回答维持本地处理。

## 8. 继续顺序与完成标准

1. **建立真实基线。** 克隆交接分支，安装、检查并打开两条路线，记录实测环境和问题。不要先重写整个项目。
2. **验证两个样片。** Google Vids 登录与可用额度确认后先做 S02 人猫互动、S06B 面部反应。完整播放、对照原照，检查脸、手、猫、重量、道具、机位和声音，样片合格后再批量制作。
3. **执行批准剧本。** 按实际平台能力选真正 Extend 或明确切镜。记录真实文件、规格、时长、剪入区间、失败/待审/通过状态，不把下载成功直接算合格。
4. **实际剪辑驱动时间轴。** 至少五分钟有效剧情，有明确告白，场景连续，无禁止动物/声音。同步 HLS、时间轴、热点、封面、艺术字与音轨，以独立版本验证。
5. **真实手机验收。** 微信开声、首屏、加载、暂停、恢复、重播、退出告白、安全区域与竖屏触摸；圣诞照片、猫和背景的问题也要实测。交互不阻断故事。
6. **保留回退。** 保存可信进度和真实输入，核实远端；需要上线时再按 Sites 流程发布并检查主域名、固定路线。

完成新片的证据包括可播放真实素材、片长与剪辑记录、逐镜人工检查、手机验收、源码和静态资源对应关系、实际线上版本。剧本、额度等待、参考图与构建通过只代表各自阶段成果。
