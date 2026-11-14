# Claude Code 接手说明

## 先确认任务与状态

**2026-11-13 后续选择：用户已选 Fluffy Beast 的 Low Poly Stylized Kittens（D），要求六种毛色全部加入，带追逐、扑玩和轻拍互动。真实模型包尚未取得；`codex/fluffy-kitten-playground` 保存接入准备，见 [六猫接入记录](docs/FLUFFY_KITTENS.md)。不要把现有 CC0 猫复制六份冒充 D，也不要把尚未挂载的组件报告为已上线。**

**2026-11-13 用户新要求优先于以下历史交接：立即恢复圣诞首页、替换 favicon、改善小猫。首页现在固定为 Christmas；不再等待 12 月 25 日。`/letter/` 与 `/christmas/` 保留。本次任务包含正式发布，详情及实际验证范围见 [恢复记录](docs/RESTORATION_2026_11_13.md)。**

用户要求把全部已有进展交到 GitHub，随后由 Claude Code 继续。视频制作暂停；本次交接没有要求重新部署、改 DNS 或合并到旧 GitHub 主分支。先读 [完整交接](docs/CLAUDE_HANDOFF.md) 和 [新电影制作交接](production/tonight-we-change-course/README.md)。

- 基线：Sites v26，源码 `2abfef734dab07d8279e04ac35b981bcb8bb2287`，线上 `https://tanchensiyi.com/`。
- 现有主页：203 秒旧片去鸟重剪 + 90 秒尾声，约 4:53。
- 新片《今晚，改道》：目标 322 秒；**0 条生成素材，0 条验收，未剪辑、未集成**。
- 2026-11-12 只遇到 Google 登录失效和安全登录请求超时，没有提交生成，不能断言当天额度恢复或仍未恢复。
- README、当前源码、当前影片时间轴和制作状态文件优先于旧里程碑文档。特别是旧 README 中 `cat.video: null` 已失效；当前配置仍启用已有圣诞 MP4。新片实际状态以 `production/tonight-we-change-course/progress.json` 为准。
- 同日上次 Git 交接生成过本地提交和 bundle，但在实际推送前临时环境被重置。该本地提交不等于远端已保存；必须读取当前远端分支确认实际交付。

## 项目地图

| 入口 / 文件 | 职责 |
| --- | --- |
| `src/main.tsx` → `src/SeasonalEntry.tsx` | 路由判定后懒加载告白或圣诞体验 |
| `src/lib/experience-route.ts` | 首页为圣诞树；固定 `/letter/`、`/christmas/` |
| `src/journey/CastleRide.tsx` / `.css` | 当前告白首页、视频舞台、交互与手机布局 |
| `src/journey/useRidePlayback.ts` | 当前 HLS 地址、原生 HLS / hls.js、播放与恢复逻辑 |
| `src/journey/rideTimeline.json`、`rideHotspots.ts`、`mapRideHotspots.ts` | 片段时间轴与热点映射 |
| `src/journey/useRideSequence.ts`、`useFinaleSound.ts`、`finale/` | 90 秒尾声、音轨、Three.js / Canvas 路径 |
| `src/journey/RideConfession.tsx` / `.css` | 明确告白；回答只保留在本地体验状态 |
| `public/journey/film/` | 现有 720p / 1080p HLS、清单、公开时间轴 |
| `src/App.tsx`、`src/scene/` | 圣诞场景、树、照片、小猫、背景、相机 |
| `public/scene.json`、`public/photos/manifest.json` | 圣诞素材配置与 95 张原图顺序 |
| `src/components/PhotoGallery.tsx`、`PhotoViewer.tsx` | 相册与按需加载的高清查看 |
| `src/hand-tracking/` | 用户开启模式才请求摄像头的本机识别 |
| `scripts/prepare-photos.mjs`、`prepare-scene.mjs`、`prepare-hand-tracking.mjs` | 从源素材生成运行资源 |
| `scripts/finalize-build.mjs` | 清理重复源素材、生成两条静态路线入口 |
| `docs/malaysia-film/`、`production/tonight-we-change-course/` | 新电影导演包、连续性与实际进度 |

`src/confession/ConfessionPage.tsx` 是历史页面，**不是当前主域名入口**。

## 本地命令

Node.js ≥20.19，CI 使用 24。首次执行需要 npm 下载及 MediaPipe 模型网络访问。

```bash
npm ci
npm run dev
npm run lint
npm test
npm run build
npm run preview
```

`predev` / `prebuild` 自动执行 `photos`、`scene`、`hand-assets`；不要跳过后直接拿缺失 `public/generated/` 的目录作为成品。生成目录、`node_modules/`、`dist/` 不入库。正常网页构建使用已入库的 HLS；只有重新剪辑影片才需要 Python、FFmpeg、ffprobe 和真正的源片。旧报告里的绝对工作区路径不能当作已经随仓库交付的输入。

## 必须保留的设计和素材约束

- 主域名从 **2026-11-13** 的恢复版本起直接打开圣诞树；固定 `/letter/`、`/christmas/` 必须继续可用。既有季节自动任务只需验证现状，不应恢复已撤销的日期门槛，不重复建立。
- 保留 `public/photos/` 的 95 张原文件、清单顺序和 [来源](docs/PHOTO_SOURCES.md)。封面是 `Image_2026-11-07_040144_237.jpg`。生成优化图可以重建，原图不覆盖。
- 真人身份参考为 `docs/film/HUMAN_ORIGINAL.jpg`。脸要接近本人，不能换成通用公主脸；不把生成参考脸当真人真值。
- 她怕尖嘴动物：新片排除鸟、鸡、纸鸟、鸟形装饰、飞行动物及鸟叫，逐片实看实听。现有去鸟剪辑只证明删掉已知段落，没有全片逐帧无鸟保证。
- 她喜欢猫和榴莲；猫需正常四足、自然运动和落地接触。榴莲是人的食物笑点。马来西亚是双方谈过的未来愿望，不是已发生旅行、已订行程或已同意恋爱。
- 目标是真正有行动和转折的至少五分钟剧情。不得用静态照片推拉、重复、慢放、等待点击或拖长烟花补时长；台词自然简短，交互可选，不打断完整观看。
- 用户指定 Google Vids，不使用 Flow。界面曾显示 Omni，不能未经核实写成 Veo。真正 Extend 必须来自平台支持的已有生成片段，否则用导演包的明确切镜方案。
- 小猫、照片黑屏、树和背景的一体感、首次加载与真实手机流畅度是持续的质量关注点，不能仅凭代码或自动测试宣布解决。
- iPhone / 微信竖屏优先。使用真实 viewport、安全区域与触摸测试，不凭型号推算并硬编码屏幕大小。支持减少动态效果和后台暂停。
- 回答告白的选择是本地状态；保持尊重选择，不添加默认同意、拒绝按钮逃跑或未授权的回复上报。

## 高效的下一步

1. 先跑现有检查并打开两条路线，记录本机实际结果。不要在空白重建中丢掉现有照片、媒体、手势和季节路由。
2. 继续制作时，从 [实际尝试](production/tonight-we-change-course/ATTEMPTS.md) 核实登录和额度。先制作 S02 人猫互动、S06B 面部反应两个质量样片，通过本人脸、猫动作与场景连续性检查后再批量生成。
3. 新素材保存独立路径，记录真实来源、时长、分辨率、帧率、剪入区间与验收。用实际片长更新时间轴，不让计划时长冒充输出时长。
4. 新片接入时一起更新 HLS、源码与公开时间轴、热点、封面和音轨。先校验所有清单引用，再检查原生 HLS、hls.js、Canvas 降级和实际手机播放。
5. 确认质量后才替换旧片。保留可回退版本，提交清晰的小批变更，不写入账号、密码、验证码、Cookie、签名地址或临时会话链接。

## Git、构建与部署边界

用户授权保存现有进度，不等于要求合并旧 GitHub 分支或发新版网站。推送后应读取远端提交核实，再报告成功。不要强推或覆盖既有工作。

- `.github/workflows/check.yml`：PR / main push 执行 lint、test、build；仅推交接分支不保证自动运行。
- `.github/workflows/gift-preview.yml`：历史 `codex/christmas-gift-redesign` 分支发布 `gh-pages/preview-2026/`，与 Sites 生产无关。
- `.openai/hosting.json` 中现有项目身份保留。生产发布须使用同一提交构建的完整 `dist/`，不能混用旧清单和新视频。
- Sites 大媒体传输经验见 [SITES_MEDIA_DELIVERY.md](docs/SITES_MEDIA_DELIVERY.md)：64 MiB 单次推送限制、小批素材提交、必要时本地 `pack.useSparse false`。这是该源码服务的传输规则，不是 GitHub 的通用文件限制；不要原样重试超限载荷。
- 不把构建成功、历史截图、离屏数学检查或 Canvas 降级写成 iPhone 微信 WebGL / 小猫观感已经验收。
