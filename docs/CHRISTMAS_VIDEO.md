# 集美小喵的圣诞变身｜Veo 提示词与操作手册

更新日期：2026-11-07（美国太平洋时间）。
网站：https://jimeixiaomiao.wildmole.chatgpt.site/
原项目：https://github.com/yil384/christmas-tree

## 这个网页到底需要哪些视频？

**先做 P1、P2 两条 8 秒 Veo 素材，剪成 A 15 秒 + B 15 秒的一支 30 秒影片；点击网页中的小猫时播放。** P3、P4 按需要补充。

| 优先级 | Veo 素材 | 页面中的用途 |
| --- | --- | --- |
| 必需 · P1 | 光幕散开，露出同一只圣诞猫；8 秒，9:16 | A 段“人变猫”的后半段。原人物被后期光幕完全遮住时，切到 Veo 猫镜头。 |
| 必需 · P2 | 同一只猫被光幕完全包住；8 秒，9:16 | B 段“猫变回原人物”。从 A 的真实末帧接续，在完全不透明的遮挡中切回原人物图层。 |
| 可选 · P3 | 自然眨眼、动耳、尾尖动作、抬头看烟花；8 秒，9:16 | 影片里的猫表演补镜，呈现体积、重量和自然小动作。 |
| 可选 · P4 | 迪士尼童话城堡、金白与淡粉色唯美烟花空景；8 秒，9:16 | 影片开场、收尾或人物背后的合成空景，在既定 30 秒时间线内使用。 |

网页主场景采用 **8 个方向、每隔 45° 的高清静态视角图**，与全景基底共同构成可环绕环境；树、地面和背景由同一台 3D 相机转动与光学缩放，烟花由代码实时绘制，网页小猫通过 3D 动作表现。素材配置位于 `public/scene.json` 的 `background.panels`，方向图为 `public/backgrounds/storybook-view-00.webp` 至 `storybook-view-07.webp`。这些主场景素材不使用普通 9:16 Veo 视频铺底；竖版变身片通过点击小猫打开的播放器观看。

## 先看这一页：这次怎么做

目标是两段可接起来的圣诞小短片：A 人变猫，B 猫变人；各 15 秒，合起来 30 秒。圣诞树、蓝紫色童话城堡、香槟金魔法和灰白长毛小猫延续网站的造型。人物保留原图中的花饰蓝裙、头发和首饰。

**最终采用：原始人物图层 + Veo 小猫片段 + 完全不透明的魔法遮挡。** 有人脸的画面直接来自原照片或本人实拍，Veo 不重新画脸。人物与猫在完全看不见的时候切换。只有照片时，人物保持静态，雪、灯光和魔法可以运动；要自然转头、眨眼，就用真实拍摄的视频。

### 最短操作清单

1. **先准备两张工作图。** 在编辑器中制作无人无猫的 `EMPTY_SCENE.png`，再做主体区域完全盖住的 `OCCLUDED_START.png`。这两张尚不在素材包中。现有 `references/CAT_END_TARGET.png` 是猫场景参考；原人物 JPG 只留在剪映 / CapCut 图层里。
2. **打开 [Google Flow](https://flow.google.com/)，新建项目。** 普通提示框点模型名称 → `Video → Frames`，选 **9:16、8 秒、1 个结果**。一般先用当前可选的 **Veo 3.1 Fast** 验证动作，再考虑 Quality 重出满意镜头；核对实际模型名称和费用。需要静音时在项目 `Settings → Return silent videos` 打开。[S4] [S5]
3. **生成 P1。** `+ Add start frame` 放 `OCCLUDED_START.png`；`+ Add end frame` 放 `references/CAT_END_TARGET.png`；复制本页 P1 提示词并生成。检查猫是否真正落地、光幕是否完全遮住主体、猫脸与衣服是否稳定。
4. **下载 P1。** 素材卡片 `More → Download`，下载视频而非 GIF；可保存为 `P1_CAT_REVEAL.mp4`。检查可用的 1080p / 4K *upscaling* 选项和下载文件实际尺寸，不能靠提示词里的“4K”代替设置。[S2] [S3] [S5]
5. **在剪映 / CapCut 先完成 A。** 按下方时间线做“原人物 → 100% 不透明光幕 → 猫”，剪到 15 秒并导出；从这支最终 A 视频保存实际最后一帧 `A_FINAL_CAT.png`。这张图此时才产生。
6. **再生成 P2。** Flow 仍用 `Video → Frames`，首帧放 `A_FINAL_CAT.png`，尾帧先留空；复制 P2 提示词，生成并下载，可保存为 `P2_CAT_OCCLUDE.mp4`。任何输入帧都不包含可见的人脸。
7. **完成 B 并合并。** B 前 4 秒接续同一只猫，4–7 秒用全遮挡切回 A 的同一个原人物图层，7–15 秒返回人物画面；A 15 秒 + B 15 秒合成 30 秒。只有照片时人物保持静态，自然动作来自本人实拍。
8. **导出网站版。** **MP4 / H.264、1080×1920、9:16、30 秒**；帧率跟素材一致，视频先用约 **5 Mb/s**、AAC 音频约 128 kb/s，检查最终文件 **≤24 MiB**。成片通过网页的点击小猫入口播放；接入路径见第 7 节。

P3 可用 `references/CAT_END_TARGET.png` 或当前猫片段真实末帧作为首帧；P4 用待制作的 `EMPTY_SCENE.png` 作为首帧，两者尾帧都可先留空。各自的完整提示词在下方，按需再生成。

**15 秒是剪辑时长，不是要求 Veo 一次生成 15 秒。** 本手册提供四段完整英文提示词：P1/P2 是必需变身素材，P3/P4 是可选补镜。人物露脸画面始终使用原照片或本人实拍，只在编辑器中合成，不交给 Veo。

当前交付为手册与静态参考素材。尚未在你的 Google 账号中生成视频，素材包中也没有已完成的变身 MP4。

## 1. 素材包里有什么，分别怎么用

以下路径均相对于解压后的 `Xiaomiao_Christmas_Veo_Kit` 文件夹。三张人物 JPG 仅增加用途前缀，内容来自原始 ZIP；不是重新画的脸。

| 文件 | 用途 |
| --- | --- |
| `references/HUMAN_ORIGINAL_Image_2026-11-07_040144_237.jpg` | 蓝色花饰长裙主照片。A 出场、B 返回都用这一张原人物图层。原图为 1440×2160；裙摆有画面裁切，不补画没拍到的脚和身体。 |
| `references/FACE_CHECK_ONLY_Image_2026-11-07_040159_036.jpg` | 只在本地辅助对照五官，不上传到生成模型。 |
| `references/HALLOWEEN_BACKUP_Image_2026-11-07_040059_391.jpg` | 昨天的万圣节造型备查。本片不用蘑菇帽、万圣节妆容或服装。 |
| `references/christmas-cat.png` | 本次圣诞猫的透明角色图：圆脸、灰白长毛、浅绿金眼睛、红绒披肩、白毛边、金星扣。用于角色参考。 |
| `references/cat-original.jpg` | 最初的猫参考照片。若采用圣诞角色，就以 `christmas-cat.png` 为主，不把两张猫图混成第三只猫。 |
| `references/CAT_END_TARGET.png` | 已准备的竖版猫场景目标：树在左、城堡在右、猫在前景。可用作猫片段首帧或尾帧目标。它不是 A 的真实视频末帧。 |
| `references/castle-style-reference.webp` | 城堡与雪景风格参考，不是人物首帧；不要拉伸成竖屏。 |
| `Xiaomiao_Christmas_QR_Card.png` | 指向当前网站的二维码贺卡。 |

后续操作中会用到这些工作文件名，它们需要在制作时保存，包里没有把它们伪造成已完成的帧：

- `EMPTY_SCENE.png`：同一构图中没有人和猫的背景。
- `HUMAN_START.png`、`HUMAN_RETURN.png`：在同一背景上合成的原人物画面，使用同一个原人物图层。
- `OCCLUDED_START.png`：主体区域被不透明金白光幕完全盖住的首帧。
- `A_FINAL_CAT.png`：从最终剪辑导出的 A 段提取的真实最后一帧。

人物原图、露脸实拍和带人脸的合成画面只在编辑器中使用，不上传到生成模型。Veo 输入限于猫、无人背景和完全遮挡的画面。网页的 8 方向静态视角图与全景基底用于环绕环境，不直接压窄为 9:16 视频画面。

## 2. Flow 怎么选：模型、时长、高清设置

以下为 2026-11-07 核对的官方 Flow 功能，不代表已经查看了你的账号选择器。Flow、Gemini 聊天界面和 Cloud/API 的选项不同，不互相套用。

**入口别选错：** 当前 Gemini Apps 的官方视频说明使用 **Gemini Omni 1.2 Flash**。进入 Gemini 的“生成视频”不等于选中了 Veo；本流程使用 Flow，并在提交前确认实际 Veo 型号。[S7]

| 本次用途 | 设置与选择 |
| --- | --- |
| 首帧或首尾帧控制 | `Video → Frames`；9:16；8 秒。当前可用 Veo 3.1 Fast 或 Quality 时均可选这条路线；一般先用 Fast 验证动作与接缝。 |
| 猫角色 + 场景参考 | `Video → Ingredients`；9:16；8 秒。当前 Flow 的 Veo 3.1 Fast / Lite 支持；Quality 不支持 Ingredients。 |
| 便宜试构图 | Veo 3.1 Lite，标准 720p。当前支持首帧、首尾帧和 8 秒 Ingredients。 |
| 高清正式版 | 先用兼容的 Veo 模型完成满意片段，再检查实际下载/升级选项。当前 Flow 积分表对 Fast/Quality 等退休中模型列出：Plus/Pro/Ultra 可升级 1080p，Ultra 可升级 4K。 |

功能与套餐依据：[S1] [S2]。这次希望高清，**不要继续默认用 Lite 的 720p 试片作为最终成片**。先看猫脸、毛发、披肩、树枝在实际下载文件里是否清楚；提示词里的 “4K” 或 “sharp” 不能代替产品分辨率设置。

Google 对 Veo 的 1080p/4K 功能明确使用“upscaling”一词。升级输出尺寸可以改善交付规格，但不能把原参考中没有的细节称为恢复出的真实细节。人的原图不经过生成式脸部超分，背景和猫可单独选择更高质量输出。[S3]

当前 Flow 官方说明：Veo Extend 已于 2026-11-05 停止；Veo 3.1 Fast/Quality 计划于 2026-12-05 停止。**本流程用独立短片和剪辑完成 15+15 秒，不依赖 Veo Extend。** 如果你的界面已无对应 Veo 选项，不把 Omni 假称为 Veo；Flow 的 Omni Flash 1.2 是另一模型，订阅用户可用较长时长，但原脸仍应按本手册的方法合成。[S1]

### 实际点击顺序

1. 打开 https://flow.google.com/ ，新建项目，例如“集美小喵 Christmas”。
2. 在输入框点模型名称，再点 `Video`。这次使用普通提示词框，方便逐次核对输入素材。
3. 用 `Frames` 时，把图片分别拖入 `+ Add start frame`、`+ Add end frame`；用 `Ingredients` 时添加猫和环境，并在提示词里明确角色。
4. 选择 9:16、8 秒、一次先出 1 个结果；核对活动模型和显示费用，再提交。发现模型自动切换时，重新检查它是否支持当前模式。[S4]
5. 先做无对白版。项目右上角 `Settings → Return silent videos` 可开启静音输出。之后在剪辑里统一配乐；仅写 “Silent output” 不替代界面设置。[S5]
6. 素材合格后用素材卡片的 `More → Download` 下载视频，检查当前账号提供的高清选项和文件实际尺寸。不要用网页截图或录屏代替下载原视频。[S5]

## 3. 原人物画面怎样准备

推荐在剪映/CapCut、Photoshop 或其他支持图层和蒙版的编辑器中处理。这里用到的是背景分离和普通合成，不是生成新的人脸。

1. 建立 9:16 画布。常规交付用 1080×1920；人物原 JPG 保持单独图层。
2. 准备 `EMPTY_SCENE.png`。沿用猫场景的树、城堡、雪地和光向；如果从带猫的场景准备空景，只处理猫和附近雪地，不把人脸放进生成式编辑。也可以选同风格无人场景，最后用全屏光幕隐藏背景切换。
3. 对蓝裙原图做人物蒙版。修好头发、耳饰和裙摆边缘，人物内部仍用原图。不要启用美颜、五官重塑、磨皮、AI 重打光或生成式补画。
4. 将原人物放在树旁。保留原图已经裁切的景别，裙摆可自然延伸到画面下缘；不为了露出脚而生成新的身体。
5. 调整背景以配合原人物的光色，暂不对脸调色。保存 `HUMAN_START.png`；复制相同位置、大小、蒙版得到 `HUMAN_RETURN.png`。
6. 为 P1 准备 `OCCLUDED_START.png`：在同一空景上叠加金白色光幕，中心不透明度 100%，覆盖未来人物从头顶到裙摆的整个区域。柔光和粒子只放在外围。后面第 5 节给出如何保证遮挡有效。

合成保留的是原照片中的人物视觉内容。视频编码、缩放和色彩转换可能改变像素数值，因此准确承诺是“原脸不重绘”，不是导出 MP4 与 JPG 逐像素、逐字节相同。若要真人自然转头或眨眼，替换为本人实际拍摄的固定机位短视频；不使用照片生成人物动作后仍声称脸完全未动。

## 4. Veo 素材提示词：P1–P4

P1/P2 为主要变身素材，P3/P4 在需要补镜时使用。提示词中的秒数是镜头设计目标；最终遮挡与切换时机由后期控制，不能假定模型逐秒严格执行。

所有提示词中的小猫均为同一个参考角色。迪士尼奇幻圣诞与《白雪公主》式森林童话的唯美感，来自蓝紫城堡、暖金灯窗、自然小动物表演、细致毛发和稀疏烟花。猫的爪子、体重与接触阴影必须落在同一片雪地上，树干扎进雪里，没有白雾圈和贴纸边缘；人物保持原始照片外观。

### P1：光幕散开，露出小猫（8 秒；必需）

推荐 `Frames`：首帧 `OCCLUDED_START.png`，尾帧 `references/CAT_END_TARGET.png`。若用 `Ingredients`，上传圣诞猫和场景参考，选兼容模型；不要同时套用不兼容的首尾帧控件。

```text
Create one eight-second vertical 9:16 magical Christmas shot with a locked-off camera. Preserve the snowy courtyard, evergreen Christmas tree on the left, blue-violet fairytale castle on the right, warm champagne-gold lights, perspective and composition of the supplied scene. Use the romantic warmth of a classic Disney-style Christmas fairytale and an enchanted storybook woodland, with clear architectural detail and refined cinematic lighting.

Begin with a dense warm-white and gold magical curtain already covering the entire subject area, from above the future person's head to the snowy ground. The center is fully opaque: no silhouette, face or body part is visible through it. Hold full coverage briefly. From approximately 1.5 to 3.5 seconds, open the curtain outward and reveal one small grey-and-white long-haired kitten seated in the same foreground position. Leave the kitten clearly visible for the rest of the shot and settle into the supplied final-frame composition.

Preserve the reference kitten's round face, pale green-gold eyes, pink nose, fluffy white chest, natural eye proportions and grey-and-white markings. Keep its red velvet Christmas cape, ivory-white fur trim and gold star clasp. Give the kitten a physically connected, three-dimensional body with visible weight: paws rest firmly on slightly compressed snow, with a small soft contact shadow directly beneath the paws and body. Fur and cape share the scene's light and perspective. The tree trunk enters the snow naturally, with no floating base or white fog ring.

The kitten breathes gently, blinks slowly once, makes a tiny ear movement and gives one relaxed tail-tip movement. Movements overlap softly rather than repeating in a mechanical loop. Fine visible fur, crisp velvet texture and restrained warm sparkles; keep the cat and its contact with the ground sharp and readable. This is a living little animal in the scene, not a flat cutout or a stiff sticker.

No person or human face, no visible body morphing, no hybrid creature, no duplicate kitten, no extra limbs, no sliding paws, no floating shadow, no white outline or fog halo, no camera movement, no text and no dialogue. Silent output.
```

如果输出的光幕不够实，直接在后期补足遮挡；在剪辑里叠加真正不透明的遮挡中心。若只想先做最少步骤，可以直接用 P3 生成猫镜头，再在剪辑里完成全部光幕。

### P2：小猫被光幕完全包住（8 秒；必需）

推荐 `Frames`；首帧用 `A_FINAL_CAT.png`。必须先完成并导出 A 才有这张图。尾帧可不填；若填写，应是同一背景中的完全遮挡画面，不能填人物照片却仍把这段叫作“没有生成脸的素材”。

```text
Create one eight-second vertical 9:16 continuation from the supplied first frame. This image is the actual final frame extracted from the preceding finished A shot. Preserve the same kitten, fur markings, pale green-gold eyes, red velvet cape, ivory-white fur trim, gold star clasp, pose, screen position, Christmas tree, castle, snow and lighting. Keep the camera completely locked. Continue the same romantic Disney-style Christmas fairytale atmosphere without changing the character design.

For the first four seconds, the kitten remains seated with natural weight on the snow. Keep its paws and lower body visibly grounded, with a compact soft contact shadow and subtle snow compression. Add gentle breathing, one slow blink, a slight ear response and a small relaxed tail-tip movement. Its fur, shadow and cape move coherently with the body; avoid the appearance of a rigid pasted-on image.

After the clear opening, a few champagne-gold sparkles gather beside its paws and grow into a warm-white and gold magical curtain. By approximately the sixth second, the curtain fully hides the kitten and covers the complete area where a standing person will later appear, from the snow to above head height and across the full dress width. Keep that entire area completely opaque through the final frame. No silhouette or body part is visible inside it. The ground remains clear outside the curtain, without a separate fog ring around the tree.

Keep fur and velvet sharp before occlusion, architectural edges stable, and the same soft snowy lighting throughout. Do not reveal or generate a person. No transparent transformation, no human face, no hybrid anatomy, no extra animals or limbs, no sliding body, no floating feet, no camera movement, no text and no dialogue. Silent output.
```

### P3：自然小猫眨眼、动耳、看烟花（8 秒；可选补镜）

`Frames`；首帧用 `references/CAT_END_TARGET.png`，或当前已验收猫片段的真实末帧。小猫要自然呼吸、慢眨眼、动耳、轻摆尾尖，并抬头看远处烟花；爪子和身体保持重量，动作连贯。也可用作 P1/P2 的主体补镜，魔法在后期完成。

```text
Animate the supplied kitten scene as one eight-second vertical 9:16 shot with a locked-off camera. Keep the composition, tree ornaments, snow surface, castle, architecture and lighting stable. Preserve the same grey-and-white long-haired kitten: round face, pale green-gold eyes, pink nose, fluffy white chest, natural eye proportions, red velvet cape with ivory-white fur trim and a gold star clasp. Use warm, elegant Disney-style Christmas fairytale lighting with the gentle charm of an enchanted woodland.

Give the kitten a natural little performance rather than a frozen sticker. Begin with quiet breathing and one slow blink. Let one ear turn slightly as if it hears a distant sparkle. The head then lifts a little toward a distant firework above the castle, followed by the eyes; the body stays comfortably seated. Add one soft tail-tip curl, a tiny weight adjustment and a calm return of the gaze. Let these movements overlap with irregular, believable timing instead of an obvious repeating cycle. Finish in a relaxed pose.

Keep both front paws resting on the snow and preserve stable anatomy and body proportions. The paws and body have soft, compact contact shadows, and the snow compresses subtly beneath their weight. Fur and velvet respond to the same light as the background. The tree trunk is rooted in the snow. Preserve clear fur strands and sharp cape detail, with only sparse delicate snowflakes and restrained sparkle reflections.

No walking, no large turn, no body sliding, no floating paws, no white outline, no haze ring, no flat cutout motion, no transformation, no person, no new animal, no costume change, no extra limbs, no camera movement, no text and no dialogue. Silent output.
```

### P4：迪士尼童话城堡与唯美烟花空景（8 秒；可选）

`Frames`；首帧用 `EMPTY_SCENE.png`。如果你只有带猫的 `CAT_END_TARGET.png`，先准备没有猫的空景，不能直接把带猫图片当空景首帧。

烟花放在城堡上方远处，以金白色为主、少量淡粉点缀。建筑、树和地平线保持静止，最后 1 秒让爆点和长尾消退，方便剪接。这段是影片空景，不承诺自动无缝循环，不用于铺满 360° 主场景。

```text
Animate the supplied empty Christmas courtyard as one eight-second vertical 9:16 cinematic background plate. Preserve the evergreen Christmas tree on the left, the elegant blue-violet fairytale castle on the right, snow surface, horizon, camera angle, architecture, ornaments and warm champagne-gold window light. Aim for the romantic beauty of a Disney-inspired castle at Christmas and the hand-painted warmth of a classic enchanted storybook woodland. Keep the camera entirely locked and all buildings, the horizon and the tree structure perfectly stationary.

Between approximately 1.5 and 6 seconds, show two or three graceful distant fireworks above and behind the castle spires. Use luminous gold-white trails with a few delicate blush-pink petals, elegant branching arcs and slowly fading fine sparks. Keep the bursts proportionate to the distant castle. Their reflections gently warm the snow and windows without washing out the scene or changing the overall exposure. A few fine snowflakes drift through the air and tiny tree lights twinkle subtly.

Keep the foreground beside the tree empty for later compositing. The trunk enters the snow naturally and has a small grounded contact shadow, with no white mist ring. Preserve crisp branches, stonework, rooftops and snow texture, with deep readable focus rather than heavy blur. Let all firework bursts and long spark trails fade before the final second. Keep seconds 7 to 8 calm and visually clean, with only sparse snow and steady warm lights for an easy editorial cut. A seamless loop is not required.

No person, animal, silhouette, moving buildings, bending spires, camera motion, thick smoke, fog veil, glowing ground halo, large exposure flashes, text or dialogue. Silent output.
```

## 5. 在剪映/CapCut 合成 15 秒 A + 15 秒 B

这是剪辑时间线。8 秒生成素材可以截取所需部分，静态人物画面可以停留；不需要把每个生成片段机械地播放完。下表沿用此前的节奏。

| 段落 | 时间 | 画面 |
| --- | --- | --- |
| A | 0–8 秒 | 原人物在树旁。脸、头发、首饰和蓝裙来自原图或实拍。 |
| A | 8–11 秒 | 金白光幕展开；完全遮挡时切换人物和猫，随后散开。 |
| A | 11–15 秒 | 同一只猫自然呼吸、慢眨眼、动耳或轻动尾尖，爪子落地、影子贴合雪面。 |
| B | 0–4 秒 | 从 A 的实际最后一帧接续同一只猫。 |
| B | 4–7 秒 | 同一光幕包住猫；完全遮挡时切换回原人物。 |
| B | 7–15 秒 | 同一个原人物图层重新出现，安静收尾。 |

### A 段：原人物 → 猫

1. 新建 1080×1920、9:16 工程；帧率与下载素材一致。先把背景放到底层，再把原人物放上去。给 A 的人物镜头设置约 8 秒停留。
2. 需要移除人物原背景时，用编辑器的背景分离/抠像和修边功能。名称随版本不同；只做透明度蒙版，不使用生成脸、换脸或人像动作功能。
3. 把 P1 的合格猫片段接在后面，或用 P3 加后期光幕。剪出末段至少 4 秒清楚无遮挡的小猫画面。
4. 在最上方新建金白色遮挡层。中心用普通混合模式、不透明度 100%；外围可以有羽化、发光和粒子。让 A 的 8–11 秒先遮住人物，再露出猫。
5. 在全遮挡区间中间切换下方镜头，前后各留几帧完全遮挡余量。不要用“滤色/Screen”混合模式或半透明发光担当遮挡中心，那会透出底下的脸。
6. 如果人物与猫背景不同、树和城堡轻微跳位，让光幕短暂覆盖整个画面再切换完整镜头。若希望背景一直可见，则把猫抠出放回同一背景；需要检查毛发边缘。
7. 将 A 剪到正好 15 秒。若猫的自然动作不够长，可以用 P3 补镜或在安静末帧短暂停留；不要用人脸 AI 补帧来填时长。
8. 导出 A 后，从成片最后一个实际显示的画面保存 `A_FINAL_CAT.png`。如果选了倒数某帧，就先将 A 剪到该帧。此时再开始 B。

### B 段：猫 → 同一原人物

1. 用 `A_FINAL_CAT.png` 做 P2 的首帧，生成回程猫素材。需要纯后期遮挡时，也可用 P3 从该帧继续。
2. 把 B 的前 4 秒保留为同一只猫；4–7 秒让光幕完全盖住它。遮挡范围要覆盖未来人物的完整高度和裙摆宽度。
3. 在遮挡中心完全不透明时切回原人物。直接复制 A 的人物图层、位置、大小、蒙版和背景；不要用模型生成一个“长得像的返回人物”。
4. 7–15 秒让光幕散开，保留原人物画面。只有照片时保持人物静态，让周围环境轻轻运动。
5. 合并 A、B；接缝处不要加溶解到第二只猫的转场。A 最后一帧和 B 第一帧应为同一构图，再由 B 自然继续。
6. 最后统一配乐。颜色调整尽量只作用于背景与猫；不要给原脸加磨皮、美颜或 AI 重打光。

**关于保存末帧：** Flow 支持暂停后 `Save frame`，并把该帧再用作首帧、尾帧或参考图。[S6] 但只有 A 最后的猫镜头未被后期裁切、调色、叠加、缩放时，Flow 原素材的末帧才可直接代表成片末帧。经过后期的 A，必须从最终导出视频取帧，不能用 `CAT_END_TARGET.png` 或重新生成的猫图冒充。

这些步骤不假定 Veo 输出透明视频。光幕的不透明中心、图层蒙版、接片时刻都在编辑器中控制；如需要素材抠像，也由后期处理。

## 6. 清晰度、接缝与人脸检查

| 检查对象 | 要看到的结果 | 出现问题时怎么处理 |
| --- | --- | --- |
| 原脸 | 五官、脸型、头发、首饰仍来自原素材，没有额外美颜或重绘 | 回到原人物图层；关闭生成式效果和脸部处理。 |
| 猫 | 灰白毛色、脸型、眼睛、披肩与星扣前后相同；毛发清楚，眨眼与呼吸自然，爪子和影子扎实落地 | 换稳定且有自然动作的猫素材；去掉白雾圈、漂浮和贴纸边缘，不用锐化掩盖变形。 |
| 变身 | 形体切换前，脸和身体已经完全不可见 | 加 100% 不透明遮挡中心，扩大覆盖范围。 |
| A/B 接缝 | 猫、树、城堡、光向和裁切连续 | 重取 A 最终导出末帧，B 从它开始。 |
| 高清输出 | 检查下载文件实际尺寸，并在正常尺寸和局部放大下看细节 | 用可用的高清输出；避免拿网页预览、录屏、微信压缩副本做母版。 |
| 时间线 | A 15 秒，B 15 秒；音乐和画面连续 | 用普通裁切、原人物停留或猫补镜调整，不要求 Veo 精确生成 15 秒。 |

仅将 720p 视频放进 1080p 或 4K 工程，不会自动恢复真实细节。素材包中的静态目标图是构图/角色参考，也不是已经完成的原生 4K 视频。

成片保留一份高质量母版，再另导出网站用版本。建议网站版使用 H.264 MP4、9:16、1080×1920、与素材一致的帧率。项目当前单个 MP4 上限为 24 MiB；30 秒文件的总平均码率应留有余量，可先以视频约 5 Mb/s、AAC 音频 128 kb/s 导出，再检查最终大小和毛发/雪花是否过度损失。此码率只是编辑建议，不是 Google 规格，也不是“高清”的保证。4K 母版不必强塞进网站的文件上限。

## 7. 成片接入圣诞树网站

交付一支 **30 秒、9:16 的完整变身 MP4**，放在点击小猫后打开的播放器。网页八方向高清静态环境与代码烟花继续作为可环绕主场景。

已经预留点击小猫播放视频的入口；当前 `public/scene.json` 的 `cat.video` 为 `null`，所以现阶段没有可播放的变身片。

1. 将验收后的 MP4 放到项目 `public/videos/christmas-transformation.mp4`。只放最终影片，不把原人物 JPG 当视频上传。
2. 打开 `public/scene.json`，保留其他设置，仅将 `cat` 中的 `video` 改为相对路径。片段如下：

```json
{
  "cat": {
    "image": "characters/christmas-cat.png",
    "video": "videos/christmas-transformation.mp4"
  }
}
```

3. 执行 `npm run build` 并按项目现有流程发布。构建会把视频写入带内容哈希的资源路径；不用手动猜测哈希文件名。
4. 打开网站点小猫，确认播放器能加载、播放、暂停和关闭；手机使用内嵌播放控件。关闭后视频卸载。视频播放声是否自动获准由浏览器决定。
5. 如果要暂时撤下成片，将 `video` 改回 `null` 并重新发布。

这些接入说明来自当前项目的 `public/scene.json`、`scripts/prepare-scene.mjs`、`src/App.tsx` 和 `src/components/ChristmasFilm.tsx`。单文件须为真实 MP4、位于 `public/videos/`，且不超过 24 MiB。

## 8. 官方来源

以下在 2026-11-07 核对。遇到账号界面与文档差异，先检查当前活动模型和套餐；不要把旧模型或其他 Google 产品的功能当成当前 Flow 已提供的按钮。

[S1] Google Flow：当前模型与功能。首帧/首尾帧、Ingredients、Veo Lite 标准 720p、Veo Extend 停止与 Fast/Quality 退役通知。
https://support.google.com/flow/answer/16352836?hl=en

[S2] Google Flow：积分与分辨率。Veo Lite 的 720p、退休中模型的 1080p/4K 升级资格、当前价格查看位置。本文不固定承诺某次生成费用。
https://support.google.com/flow/answer/16526234?hl=en

[S3] Google：Veo 3.1 Ingredients 更新。角色一致性改善、9:16、1080p/4K upscaling；没有逐像素锁定原脸的承诺。
https://blog.google/innovation-and-ai/technology/ai/veo-3-1-ingredients-to-video/

[S4] Google Flow：创建视频、添加 Frames 与 Ingredients，明确参考图作用。
https://support.google.com/flow/answer/16353334?hl=en

[S5] Google Flow：项目设置与素材下载。Return silent videos、More → Download。
https://support.google.com/flow/answer/16935308?hl=en

[S6] Google Flow：保存帧、编辑视频与拼接场景。Save frame 与 Scenebuilder。
https://support.google.com/flow/answer/16935718?hl=en

[S7] Google Gemini Apps：当前视频说明使用 Gemini Omni 1.2 Flash；用于区分 Gemini 视频入口与 Flow / Veo 工作流。
https://support.google.com/gemini/answer/16126339?hl=en

手册中的镜头设计、英文提示词、图层合成、遮挡方式和导出建议是针对本项目的制作方案；不是 Google 对生成结果或身份零漂移的保证。
