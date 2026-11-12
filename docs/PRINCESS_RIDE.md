# 思仪公主的城堡夜游

更新日期：2026-11-09。主域名与 `/letter/` 的手机竖屏体验；Christmas 路由及既有 124.5 秒影片保持独立。

## 旅程

星光邀请 → 15 秒入城影片 → 可拖动的 3D 珠宝王冠 → 15 秒人物舞厅影片 → 告白 → 触摸烟花。

首屏是清晰的城堡原画。轻触星印后，镜头通过金门、掠过水面、靠近城堡并进入大厅。王冠章节使用该入城片结尾的空大厅帧，避免浮动珠宝遮住人物脸。舞厅章节以项目原始真人照片为身份参考，展现自然走动、半转身、裙摆运动和微笑伸手；使用参考并不意味着每帧人脸能够做到像素级完全一致。

文字不虚构双方关系与共同经历。主句为「思仪公主，今晚我想耍个帅」「皇冠归你。紧张归我」「谭陈思仪，我喜欢你」，落款「奕辰」。没有强迫答复或对外发送操作。

## 真实影片来源

- 服务：用户指定的 Google Vids。
- 本次生成面板实际显示的模型名称：**Omni**，该面板没有 Veo 切换选项；不将这两段标记为 Veo 产物。
- 两段源片均为 1080 × 1920，24 fps，15.04 秒，H.264 / AAC。
- 可编辑工程：<https://docs.google.com/videos/d/1cosPd9SaGNiJrV1Vwg_cN0ioTQ2AE_gbT5TGG4tF7fU/edit?scene=id.h5848d7de89b51256_0_1#scene=id.h5848d7de89b51256_0_1>。
- 工程内已插入两段原片，以 0.5 秒 Dissolve 连接，时间线显示约 29.6 秒。网站在两片之间加入可操作王冠章节，因此不是简单播放该时间线。
- 完整实际提示词记录：`docs/princess-ride-generation.json`。
- 人物参考：已获本项目使用授权的 `docs/film/HUMAN_ORIGINAL.jpg`；环境和珠宝参考为本轮生成原画。

| 网页文件 | 尺寸 | 大小 | 加载时机 |
| --- | --- | ---: | --- |
| `princess/arrival-poster.webp` | 1080 × 1919 | 315,626 B | 首屏 |
| `princess/siyi-serif.woff2` | 标题中文子集 | 34,912 B | 首屏字体 |
| `princess/arrival.mp4` | 720 × 1280 / 24 fps | 4,244,822 B | 第一次真实点击 |
| `princess/ballroom.mp4` | 720 × 1280 / 24 fps | 2,969,228 B | 进入舞厅 |
| `princess/crown-room-poster.webp` | 900 × 1600 | 取自入城片 14.5 秒 | 开始旅程后 |
| `princess/ballroom-poster.webp` | 900 × 1600 | 取自人物片首帧 | 开始旅程后 |

两段网页影片均等比缩小、H.264 high / level 3.1 / yuv420p 编码，AAC 96 kbps，`moov` 在 `mdat` 前（fast start）。逐段完整解码通过。抽查 0、3、6、9、12 秒画面，确认人物及建筑视角真实变化，非单帧拉伸或幻灯片。

## 交互与性能

- 首屏不给 video 设置 src，不加载 Three.js。点击事件内同步设置影片地址和 `playsinline` 并调用 `play()`，之后才预热 3D 模块。
- 保留暂停、静音、重试、下一站、重看片段、返回烟花和重玩。网络慢或影片错误不会锁住后续章节。
- 王冠为实际 Three.js 几何，约 32,030 triangles、含阴影 8 draw calls；PBR 金属、宝石和环境反射。横向拖动有阻尼。
- 真 3D 烟花使用 1,600 固定粒子池、1 draw call。DPR 最大 1.6、最高 30 fps；场景离开或后台暂停。
- 无 WebGL 时使用精致透明珠宝图和无依赖 Canvas 烟花，继续全部章节。减少动态偏好关闭摆动和快速爆开。
- Web Audio 原创玻璃/竖琴音在手势后解锁，不请求外部音频。告白幕保持安静。
- 采用 viewport-fit、safe-area、svh/dvh 和 visualViewport，不硬编码微信上下栏高度。

## 本轮验证与边界

- Managed preview 实际点击完成六幕，并验证长按约 1.2 秒进入舞厅、播放、暂停、静音、首次烟花、重看片段返回、重玩。
- 在 440 × 956、430 × 880、440 × 740、390 × 740 的 iframe 视口里，等待 resize 生效后读取舞台几何，宽高及滚动宽高一致，没有横向溢出。短屏下关键按钮和字幕可见。
- 当前云浏览器没有可用 WebGL，因此预览实际覆盖了完整降级体验；Three.js 几何及粒子运行另经代码/CPU 检查，同源几何还经过 Blender 构型预览。不能把该结果描述为 iPhone 真机微信帧率或 WebGL 色彩验证。
- TypeScript 检查通过。`experience-route` 和 `build` 共 7 个既有针对性测试通过，季节切换及两条固定入口保持有效。
- 原图生成信息与字体 OFL 许可见 `docs/PRINCESS_RIDE_ASSETS.md` 和 `public/princess/siyi-serif.*`。

## 设计参考

仅参考交互节奏、克制的界面和材质呈现，未复制页面源码或品牌资源：

- Spark 的 Disney100 WebGL / AR 城堡漫游：<https://sparkemtech.co.uk/projects/software/disney-webgl>
- makemepulse 的 Cartier 珠宝体验：<https://www.makemepulse.com/case-study/cartier-le-choeur-des-pierres>
- Immersive Garden 的 Dioriviera 场景旅程：<https://immersive-g.com/projects/dioriviera-1/>
