# 思仪的城堡奇旅 · 照片圣诞树

为谭陈思仪制作的手机网页：首页为照片圣诞树，城堡奇旅与告白保留在 `/letter/`。技术栈为 React、TypeScript、Vite、Three.js 和 HLS 视频。

**2026-11-13 更新：按用户要求立即恢复圣诞首页，不再等待 12 月 25 日；新图标采用手绘 SVG 小猫，保留两条固定入口。** 猫模型与步态的本次修改和验证范围见 [恢复记录](docs/RESTORATION_2026_11_13.md)。新电影《今晚，改道》仍未生成或集成，历史交接见 [CLAUDE.md](CLAUDE.md) 与 [完整交接](docs/CLAUDE_HANDOFF.md)。

```bash
git clone https://github.com/yil384/christmas-tree.git
cd christmas-tree
```

## 现有网站

| 地址 / 内容 | 当前状态 |
| --- | --- |
| [tanchensiyi.com](https://tanchensiyi.com/) | 直接打开圣诞树，不受日期、设备时钟或域名判断影响 |
| [/letter/](https://tanchensiyi.com/letter/) | 固定告白入口：现有影片 203 秒，加 90 秒交互尾声，共约 4:53；包含明确告白 |
| [/christmas/](https://tanchensiyi.com/christmas/) | 固定圣诞入口：95 张照片、3D 树、八方向背景、骨骼小猫、高清相册、可选手势 |
| [原礼物域名](https://jimeixiaomiao.wildmole.chatgpt.site/) | 首页继续打开圣诞树 |
| 《今晚，改道》 | 新的 5:22 剧情方案；22 段剧情、29 个明确切镜镜头、4 组优先 Extend；**生成 / 验收 / 集成均为 0** |

交接基线为 Sites **v26** 对应源码 `2abfef734dab07d8279e04ac35b981bcb8bb2287`。现有主页影片是旧片去除纸鸟段落后的 `birdfree-r1`，不是新的马来西亚剧情电影。圣诞配置当前仍引用 `videos/starlight-return.mp4`；旧 README 所写“`cat.video` 为 `null`”已过时。

## 本地运行

需要 Node.js **20.19 或更新版本**；现有 CI 使用 Node.js 24。

```bash
npm ci
npm run dev
```

开发和构建前会自动准备照片、场景和手势资源。`public/generated/` 不入库，由保留的源照片和背景重新生成；首次准备手势模型需要访问 Google 模型下载地址。普通网页构建不需要运行视频剪辑脚本。

```bash
npm run lint
npm test
npm run build
npm run preview
```

`build` 包含 TypeScript 检查、Vite 打包和静态入口整理，输出 `dist/`，同时生成 `/letter/` 与 `/christmas/` 的实际入口文件。请分别检查两条路线。

2026-11-12 交接时在 Node.js **24.22.1** 的历史复验为：生产构建通过，244 项测试通过，lint 0 错误 / 4 个既有 Hook 警告。本次修改的验证范围单独记录在 [恢复记录](docs/RESTORATION_2026_11_13.md)，历史数字不当作本次结果。

## 维护入口

| 位置 | 用途 |
| --- | --- |
| [CLAUDE.md](CLAUDE.md) / [交接详情](docs/CLAUDE_HANDOFF.md) | 代码地图、当前事实、已知风险、下一步与验证范围 |
| [电影制作交接](production/tonight-we-change-course/README.md) | Google Vids 工程、实际尝试、参考图、恢复制作顺序 |
| [《今晚，改道》导演包](docs/malaysia-film/README.md) | 剧本、逐镜 prompt、生成队列、Extend 方案、连续性约束 |
| [季节路由](docs/SEASONAL_SITE.md) | 主域名与圣诞切换机制 |
| [现有影片 QA](docs/LONG_RIDE_QA.md) / [去鸟剪辑报告](docs/LONG_RIDE_BIRD_REMOVAL_REPORT.json) | 现有影片的历史验证与当前时长；不能当作新片验收 |
| [圣诞树维护历史](docs/CHRISTMAS_TREE_GUIDE.md) | 原 README 的交互、场景、照片与手势说明；顶部列明过时状态 |
| [贡献约定](CONTRIBUTING.md) / [媒体源码交付](docs/SITES_MEDIA_DELIVERY.md) | 开发检查与 Sites 大文件传输经验 |

95 张原始照片保留在 `public/photos/`，顺序见 `manifest.json`。不要替换真人身份参考、重绘原照片中的脸，或把生成参考图当作已生成的视频。保护圣诞入口、固定照片顺序和来源记录。

运行所需的旧片 HLS 与优化图片齐全；18 条旧 `clip-*.mp4` 原始镜头及部分原始旅程 PNG 不在恢复资料中，源级重剪需先从原 Google Vids 工程导出。这不阻碍当前网页构建。

优先适配 iPhone 在微信内的竖屏使用：安全区域、触摸操作、首次加载、开声、后台恢复和真实设备流畅度都需要实测。自动检查、桌面视口模拟、Canvas 降级或离屏检查不能代替手机 WebGL 与猫动作观感验收。

## 发布边界

当前线上使用 **Sites**，项目配置在 `.openai/hosting.json`。GitHub 推送、GitHub Pages 预览和 Sites 生产部署是不同操作。本次恢复请求包含更新正式站点，保留当前公开访问设置；不修改 DNS。发布前确认源码提交与构建产物对应，并验证固定入口与现有媒体。

`npm run deploy` 是保留的 GitHub Pages 命令；`gift-preview.yml` 只更新历史分支的 `preview-2026/`。不要把这些结果当作 `tanchensiyi.com` 更新成功。仓库不保存登录凭据、验证码、Cookie 或会话链接。
