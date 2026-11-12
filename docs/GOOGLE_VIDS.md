# 集美小喵：Google Vids 历史视频制作记录

> **历史旧片已弃用。** 本文记录的是 2026-11-07 的“人物静态照片＋猫片”约 30 秒方案。该方案不满足新的两分钟公主剧情要求；当前源码已设 `cat.video: null`，旧短片入口已撤下。下文保留原始制作记录，所有“已完成”“网页使用”和播放入口描述均指当时的历史状态，不代表本轮发布已经完成。
>
> 新方案与准确状态见 [《星光归来》九幕制作方案](PRINCESS_FILM_STORYBOARD.md)：角色参考图与剧本已完成，但当前 Google Vids Omni 的两次 Create 请求均遭拒绝，**可用新片段为 0 条，尚未制成新视频**。本轮已停止继续试探；新片不是本文的旧成片，也不以静态照片凑满时长。

历史核对日期：2026-11-07。当时已在 Google Vids 完成生成、剪辑及导出。以下记录实际操作和旧成片规格，保留制作提示词；历史 Flow/Veo 文档同样保留用于追溯。

## 已完成：一条生成片，五个时间线场景

| 顺序 | 内容 | 时长 | 素材来源 |
| --- | --- | --- | --- |
| 1 | 人物原照叠在城堡雪景空景上 | 7 秒 | `HUMAN_ORIGINAL.jpg`，普通图片图层 |
| 2 | 全屏纯暖金 | 1 秒 | Vids 中的纯色场景 |
| 3 | 金光散开 → 自然小猫看城堡烟花 → 金光合拢 | 15 秒 | 唯一生成的视频 |
| 4 | 全屏纯暖金 | 1 秒 | Vids 中的纯色场景 |
| 5 | 复制第一幕，回到同一人物原照 | 8 秒 | 复用第一幕 |

五个场景标称共 32 秒，四个边界各使用 0.5 秒 `Dissolve`，重叠后时间线共 30 秒。本次主方案没有使用 Extend。原始猫片首尾的金光仍透出背景，不能单独遮住切点，因此新增两个纯暖金场景；逐帧核实成片在 7.000 秒与 22.033 秒完全被暖金覆盖。[官方转场与重叠说明](https://support.google.com/docs/answer/14916386)

| 产物 | 实际规格 |
| --- | --- |
| 原始生成猫片 | 1080×1920，视频轨 15.000 秒，H.264，24 fps |
| 网页使用的 MP4 下载副本 | 720×1280，容器 30.069841 秒，5,496,862 字节，H.264 / yuv420p、30 fps、AAC 立体声 |
| 网页接入 | `public/videos/christmas-transformation.mp4`；`public/scene.json` 的 `cat.video` 为 `videos/christmas-transformation.mp4` |

最终网页文件是 720p 下载副本，不能按原始生成猫片的参数称为 1080p 成片。约 0.07 秒的导出尾部差异以文件实测为准。

该 9:16 短片可从网页首屏右上角「观看圣诞短片」或小猫入口打开。右上角卡片使用实际成片第 14 秒的猫咪城堡静帧，不依赖 WebGL。网页八方向环境继续使用静态方向图与代码烟花，不将竖版视频拉伸为整个 360° 背景。

## 三张素材及人物保留规则

| 文件 | 尺寸 | 用途 |
| --- | --- | --- |
| `CAT_SCENE.png` | 941 × 1672 | Ingredients：灰白长毛猫、红丝绒披风、主景 |
| `EMPTY_SCENE.png` | 941 × 1672 | Ingredients：匹配构图空景；也可用于人物幕背景 |
| `HUMAN_ORIGINAL.jpg` | 1440 × 2160 | 仅作为普通图片插入时间线 |

猫图与空景是视觉参考，可能有细微差异，不是严格首尾帧。Ingredients 不能保证锁定构图或角色。人物原照不上传 Create、Ingredients 或 Animate；不让生成模型重画人物脸。

人物原照的裙摆在画面底部裁切，没有脚。排版时保留这一构图，把照片/人物图层下边缘贴画布底部；不补脚、不扩成完整站姿。可在 Vids 中选择人物图片，使用账号提供的 `Edit image → Remove background` 后叠在空景上，并检查原脸、服装与边缘。最省步骤时也可直接播放整张原照，但其背景与构图会和猫的城堡雪景不同。[官方图片背景移除说明](https://support.google.com/docs/answer/14665097?hl=en)

## Vids 操作

1. `File → Video size` 或工具栏 `Video size`，选择 `Vertical / 9:16` 并应用。[画布尺寸](https://support.google.com/docs/answer/16545758)
2. 第一幕铺 `EMPTY_SCENE.png`，插入 `HUMAN_ORIGINAL.jpg` 普通图片图层，设为 7 秒。需要时按上节去背景；不用 Animate。
3. 右侧 `AI video → Create → Ingredients`，只添加 `CAT_SCENE.png` 和 `EMPTY_SCENE.png`。打开 `Omni` 参数，选择 `Portrait / 9:16`、`15 秒`、`1080p`；这些选项已在实际项目确认并用于生成。
4. 粘贴下方完整主提示词，点 `Generate`。检查猫与雪地的接触阴影和自然动作、稳定的城堡/地平线，并检查首尾金光是否完全遮挡。满意后点 `Insert`，在关闭标签页前将生成视频插入 Vid 保存。[生成、Ingredients 与会话保存](https://support.google.com/docs/answer/16143507)
5. 复制第一幕到结尾，设为 8 秒。本次在猫片前后各增加一个 1 秒纯暖金场景，四个边界各设 0.5 秒 `Dissolve`，得到上表的五场景结构；播放核对时间线总长为 30 秒。设置场景时长时选中时间线场景，拖动边缘手柄；也可按 `]` 激活右手柄，再用方向键调整并读取实际时长。[官方场景裁切快捷键](https://support.google.com/docs/answer/14955122?hl=en)
6. 本次实际使用 `File → Export to Drive` 导出，随后取得供网页播放的 MP4 下载副本；也已核实 `File → Download → MP4` 菜单。导出后用文件实际分辨率、时长和大小验收，不以生成设置代替导出规格。[官方导出帮助](https://support.google.com/docs/answer/15082958?hl=en)

本次已在实际项目核实 `Create / Edit / Animate / Extend` 标签；Create 的 Omni 设置可选 3–15 秒、Landscape / Portrait、720p / 1080p，Extend 有独立的 `Add video` 入口。Google 于 2026-11-05 公布 Vids 的 3–15 秒新功能；当前帮助列出 Ingredients 最多 7 张参考图，本次使用 2 张。[官方更新](https://workspaceupdates.googleblog.com/2026/11/gemini-omni-12-flash-now-in-vids-with-15second-generations-and-improved-quality.html)

## 15 秒片内剧本

| 片内时间 | 画面目标 |
| --- | --- |
| 0–1 秒 | 全屏完全不透明的香槟金/暖白光，背景与猫均不可见 |
| 1–3 秒 | 金光打开，露出坐在雪地上的灰白长毛猫 |
| 3–11 秒 | 轻呼吸、慢眨眼、耳朵/尾尖轻动，抬头看城堡上的金白与淡粉烟花 |
| 11–13.5 秒 | 金光合拢，覆盖猫与整个背景 |
| 13.5–15 秒 | 保持全屏完全不透明金光，随后直接切回人物原照 |

上述时间点保留为生成目标，实际猫片首尾未达到完全不透明，已用时间线中的纯暖金场景补足。没有直接用人脸与猫脸互相淡化代替遮挡。关键帧中镜头和城堡稳定，猫爪有接触阴影，树干落在雪地里；未见明显多肢、面部融化或悬浮。

## 主提示词：只生成这一条 15 秒视频

```text
Create one continuous 15-second vertical 9:16 Christmas fairytale video. Use CAT_SCENE.png as the visual reference for the same single gray-white long-haired cat, its red velvet cape with ivory fur trim and a small gold star clasp, and its placement in the scene. Use EMPTY_SCENE.png as a reference for the matching snowy setting, Christmas tree on the left, illuminated fairytale castle on the right, horizon and warm lighting. These are visual reference ingredients, not literal first or last frames. Do not introduce any human, human face or human silhouette.

Keep a locked camera with a stable viewpoint, framing and horizon throughout. No camera zoom, pan, orbit or background stretching. Romantic Disney-like Christmas fairytale atmosphere, delicate warm lights, crisp fur and velvet, clear castle details, soft natural depth, elegant restrained magic.

Timing within this 15-second clip:
0.0–1.0 seconds: the ENTIRE frame is completely covered by dense, fully opaque champagne-gold and warm-white magical light. No cat, tree, castle, snow or background can be seen through it. This is a full-frame light curtain, not transparent mist.
1.0–3.0 seconds: the light gently opens and recedes, revealing the same single cat seated naturally on the snow in the referenced setting.
3.0–11.0 seconds: the cat breathes softly, makes one slow natural blink, a small ear twitch and a subtle tail-tip movement. It gently raises its head and eyes toward graceful distant fireworks above the castle: a few gold-white blossoms with a faint blush-pink accent. Keep the buildings, tree and horizon steady. The cat should feel alive and three-dimensional, with natural fur motion and restrained body weight shifts.
11.0–13.5 seconds: warm golden magic gathers and closes over the cat and the setting until the ENTIRE frame is fully covered.
13.5–15.0 seconds: hold a completely opaque full-frame gold-and-warm-white light curtain. Nothing behind it is visible.

The cat's paws and body must make believable contact with the snow, with soft contact shadows and subtle snow compression. The tree trunk meets the snowy ground naturally. No floating paws, detached shadow, white fog ring around the cat or tree, sticker outline, cutout edge, rubbery anatomy, duplicate cat, exaggerated facial expression or melting architecture. No humans, spoken dialogue, on-screen text, subtitles or logos. No sudden camera movement. Prioritize graceful natural motion and a clear full-frame opaque light cover at both ends.
```

## 续接备用：P1 + Extend

本次已直接生成一条 15 秒猫片，未使用 Extend。以下保留为需要续接已有 8 秒片段时的备用流程：先用同样两张 Ingredients 生成 P1，或使用已有的 P1；打开 `AI video → Extend → Add video`，添加 P1 实际视频，再粘贴 P2。只有旧界面没有独立 Extend 标签时，才使用当前会话片段下方的 Extend 入口，并保持原生成会话打开。[官方 Extend 操作](https://support.google.com/docs/answer/16143507)

实际界面中 Extend 的时长滑块为 3–15 秒，但本次没有生成续接结果，不能假设输出必然是累积整片或仅续段。查看实际结果：已经包含 P1 时只保留最新合并结果；仅返回续段时按 P1 → 续段拼接，不重复前缀。参考猫图不能冒充实际生成末帧。

按猫片实际总长度调整两个人物幕，使整片 30 秒。例如不另加场景与转场时，猫片总长 16 秒，可用人物 7 秒 + 猫片 16 秒 + 人物 7 秒；这是计算示例，不是对 Extend 时长的承诺。如需补纯暖金场景，应像本次成片一样把场景时长与转场重叠一起计算，并检查切点完整遮挡。

### P1：8 秒金光露猫

```text
Create one continuous 8-second vertical 9:16 Christmas fairytale video. Use CAT_SCENE.png as the reference for the same single gray-white long-haired cat in a red velvet cape with ivory fur trim and a small gold star clasp. Use EMPTY_SCENE.png as the reference for the matching snowy setting, Christmas tree on the left and illuminated fairytale castle on the right. These images are reference ingredients, not literal first or last frames. Do not include any human or human face.

Use a locked camera with a stable viewpoint, framing and horizon. During the first second, cover the ENTIRE frame with completely opaque champagne-gold and warm-white magical light; nothing behind it is visible. During seconds 1–3, let this full-frame light curtain gently open to reveal the same cat seated naturally on the snow. During seconds 3–8, show soft breathing, one slow blink, a slight ear twitch and a small tail-tip movement. Finish with the cat clearly visible and calmly starting to look upward toward the castle sky, ready for a continuous next shot.

Romantic Disney-like Christmas fairytale mood, clear fur and velvet, warm lights and detailed stable architecture. Cat paws and body touch the snow with natural contact shadows and subtle snow compression. No floating subject, sticker edge, white fog ring, duplicate cat, camera zoom, pan, orbit, human, dialogue, captions or logos. Do not cover the ending with gold yet.
```

### P2：Extend 上一段

```text
Continue the selected generated clip directly from its actual ending. Preserve the same single gray-white long-haired cat, cape, physical position, Christmas tree, castle, snow, lighting, locked camera and stable horizon. Do not restart the reveal and do not substitute a reference image for the actual last generated frame. No human or human face.

Let the cat complete its gentle upward glance. Show a few elegant distant fireworks above the castle, gold-white with a faint blush-pink accent. Keep the cat alive with soft breathing and a restrained ear or tail-tip movement, while its paws and body remain grounded with natural contact shadows. Keep buildings and tree stable; no zoom, pan or orbit.

Toward the end of the continuation, gather champagne-gold and warm-white magical light over the cat and setting. Close this light into a fully opaque curtain covering the ENTIRE frame. Hold the final approximately one second completely opaque, with no cat, tree, castle, snow or background visible. This is dense full-frame light, not transparent mist. Maintain the romantic Christmas fairytale atmosphere. No sticker outline, floating paws, white fog ring, duplicate cat, warped anatomy, melting buildings, dialogue, text, subtitles or logos.
```

## 交付材料

此前提供的独立 HTML 指南 `Xiaomiao_Google_Vids_Guide.html` 内嵌上述三张图片的原文件字节，带逐图下载和提示词复制按钮；配套 `Xiaomiao_Google_Vids_Prompts.txt` 包含同一组完整提示词，作为制作素材保留。本次完成的 MP4 另存并接入网页，实际成片规格与五场景剪辑以本文为准。人物源照片保留原文件，剪辑中作为普通图片图层使用，未让视频生成模型重画人物脸或补脚。
