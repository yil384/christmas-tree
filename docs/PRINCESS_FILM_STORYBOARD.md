# 《星光归来》：九幕提示词与 Google Vids 操作指南

更新日期：2026-11-09。

## 当前完成到哪一步

**九幕素材与最终成片均已完成。高清母版、网页播放版已导出，网站本地接入与播放验证通过；新成片随本版本（v21）部署，公开发布完成状态以本次部署结果为准。**

- 项目：[《星光归来》Google Vids](https://docs.google.com/videos/d/1OpVaprsNUBHG8SpDvBxiv0lm3yGCfoOG32wjfddj1Fc/edit?scene=id.p#scene=id.p)。账号：`linyichen.thu.cs@gmail.com`。
- 本次实际界面显示 **Omni、16:9、1080p、15 秒，最多 3 张参考图**。这里记录实际操作，不把输出误称为已确认的 Veo。
- 完整实际提交记录：[generation-prompts.json](film/generation-prompts.json)。它从共享制作目录原样复制，包含九条成稿和 `scene07_rejected` 历史记录。下方附录另列九条可直接复制的完整 Prompt。
- 本地素材位于 `/workspace/shared/princess-film/`，文件为 `scene-01.mp4` 至 `scene-09.mp4`。旧静态短片已撤下，新正片已完成网站本地接入，待本次发布。
- **Google Vids 源工程也已完成精剪**：第 5 幕取 0–12 秒，第 7 幕取 3.5–15 秒，各幕多出的 0.04 秒 AAC 尾隙已去除，八个接缝均为 0.5 秒 Dissolve。界面精确显示 **02:04.5**，并确认 Saved to Drive。

## 最终文件与网站入口

导出目录：`/workspace/scratch/7dbdec9a2b48/princess-video-production/outputs/`。

| 用途 | 文件名 | 分辨率与大小 |
| --- | --- | --- |
| 高清母版 | `princess-christmas-master-1080p.mp4` | 1920 × 1080；143,878,978 字节 |
| 网页播放版 | `princess-christmas-web-720p.mp4` | 1280 × 720；24,270,945 字节，约 23.147 MiB |

两版均为 **124.500 秒、24 fps、2,988 帧**，音画时长一致，完整解码检查通过，`moov` 已前置。网站使用网页播放版，源码文件为 `public/videos/starlight-return.mp4`，实际资源 `src` 为 `generated/videos/transformation-5c1fe60031a51da6531d.mp4`。当前播放器为兼容托管端的媒体跳转，在点击播放后下载完整文件并用本地 Blob 播放；这不是边下载边播放。直接跳过开屏不会触发影片下载。

本地浏览器已确认视频正常播放、时长 124.5 秒且无播放错误；跳过、声音、退出与重放均通过。此项是本地接入验证，不提前记为公开部署完成。

## 故事

圣诞树失去星光，女主跟随灰白小猫进入雪林。寒溪挡路时，她先温暖小猫，善意唤醒渡溪的光。她带着猫和晶星回到城堡；故事以树顶星光、小猫在舞厅拨铃和城堡烟花完成庆祝。

后 3 幕实际采用树与城堡、小猫、烟花镜头，不再安排女主起舞或女主与猫同框看烟花。

## 最终精剪方案

**保留源素材 128.5 秒，八个接缝各重叠 0.5 秒，成片实测 124.5 秒，即 2 分 4.5 秒。播放器显示为 2:05；24 fps 时间线共 2,988 帧。** 最终导出文件与 Google Vids 源工程的时长已一致。

| 幕 | 源文件 | 源片截取区间 | 保留时长 | 正片位置（含叠化） |
| --- | --- | --- | --- | --- |
| 01 · 星光的求助 | `scene-01.mp4` | 00:00–00:15 | 15 秒 | 00:00–00:15 |
| 02 · 跟随微光入林 | `scene-02.mp4` | 00:00–00:15 | 15 秒 | 00:14.5–00:29.5 |
| 03 · 被寒溪挡住 | `scene-03.mp4` | 00:00–00:15 | 15 秒 | 00:29–00:44 |
| 04 · 善意唤醒魔法 | `scene-04.mp4` | 00:00–00:15 | 15 秒 | 00:43.5–00:58.5 |
| 05 · 越溪寻星 | `scene-05.mp4` | 00:00–00:12 | 12 秒 | 00:58–01:10 |
| 06 · 重开的城堡大门 | `scene-06.mp4` | 00:00–00:15 | 15 秒 | 01:09.5–01:24.5 |
| 07 · 晶星归位 | `scene-07.mp4` | 00:03.5–00:15 | 11.5 秒 | 01:24–01:35.5 |
| 08 · 小猫敲响庆典 | `scene-08.mp4` | 00:00–00:15 | 15 秒 | 01:35–01:50 |
| 09 · 城堡烟花 | `scene-09.mp4` | 00:00–00:15 | 15 秒 | 01:49.5–02:04.5 |

- **第 5 幕只用源片 00:00–00:12**，避开 14 秒后出现的换手问题。
- **第 7 幕只用源片 00:03.5–00:15**，去掉生成画面自带的开幅黑边。
- 其余幕取 00:00–00:15。按顺序连接，接缝为 0.5 秒叠化；不要额外重复片段、加静态尾卡或减速凑时长。

## 参考图怎么放

第 1–6 幕以真人照片作为身份依据，参考图顺序与 Prompt 中的编号对应：

| 镜头 | 参考图与用途 |
| --- | --- |
| 01 | **Image1**：`HUMAN_ORIGINAL.jpg` 原始真人照片；**Image2**：`PRINCESS_IDENTITY_REFERENCE.png`，辅助雪城堡、光线和浅蓝冬日披肩。 |
| 02–06 | 保留前两张，再加 **Image3**：上一幕的 `scene-XX-continuity.jpg`，用于服装、抱猫姿势、持物及场景衔接。 |
| 07 | 纯文本环境镜头，不附人物照片。 |
| 08 | 纯文本小猫镜头，不附人物照片。 |
| 09 | **Image1** 使用已亮起的雪城堡场景参考；本批素材提供 `scene-07-continuity.jpg`，用于延续城堡、树与树顶星。 |

原照始终优先于造型参考；人脸与本人一模一样或几乎一样是要求，不是模型保证。不要把参考照片直接铺进时间线当作动态镜头。

## 在 Google Vids 中怎么复用

1. 用上述账号打开项目，在视频生成界面选择本次使用的横版、1080p、15 秒设置。
2. 按参考图表上传图片，再复制下方对应镜头的**整个代码块**。前 6 幕的身份说明已包含在各段里，无需再拼接一个公共前缀。
3. 每段生成后先看实际动作、脸和持物，再插入项目、等待 Saved to Drive，并下载保存。下一段使用前一段真实画面提取的连续帧。本方案不依赖 Extend。
4. 九段按上方截取表剪辑，去除各幕多出的 0.04 秒 AAC 尾隙，并设置八个 0.5 秒 Dissolve；导出后核对声音、接缝与时长。本批次 Vids 工程已保存为 02:04.5，两版成片也已完成导出。

### 本批次需要记住的衔接

第 4 幕实际末尾为**右臂抱猫、左手空、两块发光踏石**，与该幕提交原文中的左臂、三块石头不同；第 5 幕因此按真实画面续写。第 6 幕末仍抱着猫，单颗五角晶星在掌上，城门已开，庭院树已有暖灯。

第 7 幕原人物放猫、升星请求被服务以 terms 提示拒绝，该人物请求已停止；完成的是独立无人环境版本。被拒文本只保存在 JSON 的 `scene07_rejected` 中，不计入九幕成片，也不作为下方操作步骤。提示词与生成结果不一致时，保留提交历史，并依据真实画面调整下一镜。

## 附录：九幕完整已提交 Prompt

下面逐条保留本批次实际提交原文，便于复制。它们记录的是本次生成方法，不代表每个细节都被模型精确执行；重做时须重新检查连续性。

### 01 · 星光的求助

女主回应小猫，启程寻找星光。

```text
Create a 15-second landscape live-action fairytale movie scene. @Image1 is the original photograph and the primary identity reference for the adult woman. Preserve her own face, facial proportions, brown bangs, half-up hair, earrings and blue floral gown throughout her movement. @Image2 is secondary: use its snowy castle atmosphere and ivory-trimmed pale-blue winter cape. The woman must act naturally as the same person, with continuous body movement and a living expression.
At blue-hour dusk, she takes several gentle steps across a snowy castle courtyard. A tall Christmas tree has gone dark and its top star is missing. A small fluffy gray-white kitten in a red velvet cape walks into her path and looks up. She notices it, crouches and gently strokes its head. A distant golden glimmer appears beyond the pine trees. The kitten turns toward the glimmer; she follows its gaze, smiles reassuringly, rises and takes her first step after it toward the forest. Show grounded feet, natural four-legged cat movement, softly swaying fabric and falling snow. Keep her face readable in a calm medium tracking shot. Romantic blue and warm gold lighting, enchanting handcrafted castle details, delicate orchestral atmosphere. No on-screen text or dialogue.
```


### 02 · 跟随微光入林

进入雪林，发现溪对岸的晶星。

```text
Create a 15-second landscape live-action fairytale movie scene. @Image1 is the original photograph and the primary identity reference for the adult woman: preserve her own face, proportions, brown bangs, half-up hair, earrings and blue floral gown during all movement. @Image2 guides only the snowy fairytale atmosphere and the same ivory-trimmed pale-blue cape. @Image3 is the preceding scene: use it to match the same outfit and the same fluffy gray-white kitten in its red velvet cape, without changing the face from @Image1. Continuous natural acting, grounded steps, realistic cloth and fur, romantic blue and warm gold lighting. No dialogue or on-screen text.

Continue the journey after they leave the castle courtyard. The woman walks at an unhurried pace into a peaceful snow-covered pine forest, with the small kitten trotting beside her left foot. A delicate trail of floating golden sparks leads ahead between the trees. She lifts the front of her skirt slightly to step over soft snow, looks down at the kitten with a reassuring smile, then looks toward the trail. The kitten briefly pauses and turns its head back to her before continuing. Follow them with a smooth medium side-tracking camera that keeps her face visible. At the end, the path reaches a narrow clear stream. Both stop safely on the near bank; a single palm-sized gold crystal star glows on the opposite bank beneath a fallen pine branch. Her hands are empty and the kitten remains on the ground. End on their curious, hopeful reaction to the star across the water.
```


### 03 · 被寒溪挡住

小猫退回岸边，女主蹲下安慰。

```text
Create a 15-second landscape live-action fairytale movie scene. @Image1 is the original photograph and the primary identity reference for the adult woman: preserve her own face, proportions, brown bangs, half-up hair, earrings and blue floral gown during all movement. @Image2 guides only the snowy fairytale atmosphere and the same ivory-trimmed pale-blue cape. @Image3 is the preceding scene: use it to match the same outfit and the same fluffy gray-white kitten in its red velvet cape, without changing the face from @Image1. Continuous natural acting, grounded steps, realistic cloth and fur, romantic blue and warm gold lighting. No dialogue or on-screen text.

Continue at the exact same narrow stream in the snowy pine forest shown in the preceding scene. The woman and kitten are both on the near bank. The single many-pointed golden crystal star remains hanging by a fine thread beneath the low snow-covered branch on the opposite bank, above the water. The kitten approaches a small stepping stone and carefully touches it with one front paw. A tiny ripple wets its paw; it steps back safely onto the snow, gives the paw a gentle shake, and curls close to the woman. A soft cold breeze moves her cape and the pine needles. She notices the kitten is chilly, turns her attention away from the distant star, and kneels beside the kitten with a tender, concerned expression. Her hand reaches down to comfort it. Start wide enough to establish both banks, then make a slow gentle push closer to their faces and the paw interaction. End with the woman kneeling and the kitten still on the ground beside her; neither has crossed the stream. No falling, injury or danger.
```


### 04 · 善意唤醒魔法

抱起小猫，渡溪踏石亮起。

```text
Create a 15-second landscape live-action fairytale movie scene. @Image1 is the original photograph and the primary identity reference for the adult woman: preserve her own face, proportions, brown bangs, half-up hair, earrings and blue floral gown during all movement. @Image2 guides only the snowy fairytale atmosphere and the same ivory-trimmed pale-blue cape. @Image3 is the preceding scene: use it to match the same outfit and the same fluffy gray-white kitten in its red velvet cape, without changing the face from @Image1. Continuous natural acting, grounded steps, realistic cloth and fur, romantic blue and warm gold lighting. No dialogue or on-screen text.

At the same snowy stream bank, begin with the woman kneeling and the kitten sitting beside her right knee as in the preceding scene. The many-pointed golden crystal star still hangs from the low branch across the stream. She gently slides both hands under the kitten, lifts it with its body fully supported, and settles it securely in her LEFT forearm. With her free RIGHT hand she draws an edge of her own pale-blue winter cape around the kitten without removing the cape from her shoulders. The kitten relaxes, blinks and nestles against her. Her warm smile is clearly visible. As she strokes its head, the hanging star glows more warmly and sends a thin golden thread of light across the stream; THREE flat, sturdy stepping stones illuminate one after another. Start with a tender medium view of the careful lift and then gently widen to show the crossing becoming clear. End with her standing, the kitten cradled in her LEFT arm, her RIGHT hand empty, and the three stones glowing. The star remains on the opposite bank. Continuous believable movement, no extra hands or duplicated animals.
```


### 05 · 越溪寻星

抱猫越溪并接近晶星。

```text
Create a 15-second landscape live-action fairytale movie scene. @Image1 is the original photograph and the primary identity reference for the adult woman: preserve her own face, proportions, brown bangs, half-up hair, earrings and blue floral gown during all movement. @Image2 guides only the snowy fairytale atmosphere and the same ivory-trimmed pale-blue cape. @Image3 is the preceding scene: use it to match the same outfit and the same fluffy gray-white kitten in its red velvet cape, without changing the face from @Image1. Continuous natural acting, grounded steps, realistic cloth and fur, romantic blue and warm gold lighting. No dialogue or on-screen text.

Scene 5 of one continuous story. Begin at the exact ending pose in @Image3: she is standing at the near bank, supporting the kitten against her chest with her right arm; her left hand is empty. The single golden crystal star still hangs by a fine thread from the low fir branch on the far bank. Two broad stepping stones glow softly in the shallow narrow stream. In a graceful wide three-quarter shot, she carefully crosses using those two visible stones, keeping the kitten securely in the same carrying arm throughout. Her gown hem moves naturally above the water. At the far bank she stops beneath the branch and raises her free left palm. The fine thread gently loosens and the one crystal star floats down into her open palm. She looks from the star to the kitten and smiles; the kitten blinks and lifts its nose to the light. Finish on a clear medium view of her safely standing on the far bank, right arm still holding the kitten, the single star hovering just above her left palm. The star has moved from the branch, so there is no second star hanging behind her. One continuous cinematic shot, slow camera follow, real changing positions, no still-image zoom, no extra hands.
```


### 06 · 重开的城堡大门

带猫与星返回，门开并进入庭院。

```text
Create a 15-second landscape live-action fairytale movie scene. @Image1 is the original photograph and the primary identity reference for the adult woman: preserve her own face, proportions, brown bangs, half-up hair, earrings and blue floral gown during all movement. @Image2 guides only the snowy fairytale atmosphere and the same ivory-trimmed pale-blue cape. @Image3 is the preceding scene: use it to match the same outfit and the same fluffy gray-white kitten in its red velvet cape, without changing the face from @Image1. Continuous natural acting, grounded steps, realistic cloth and fur, romantic blue and warm gold lighting. No dialogue or on-screen text.

Scene 6, the return of the missing star. Use @Image3 as the exact opening pose: the woman supports the kitten in her right arm and offers her free left palm beneath the single suspended crystal star. First 4 seconds, a close view clearly shows the fine hanging thread dissolve into tiny golden motes; the star separates completely from the branch and settles safely in her left palm. Keep the star as one small solid crystal ornament and keep her hands and carrying arm consistent. She looks relieved and turns toward home. Then a clean cinematic cut moves the story to the frosted iron gate of the fairytale castle seen in @Image2. In a medium-wide shot she approaches carrying the same kitten and the same star, lifts the star toward the gate, and warm gold light runs along the ironwork. Both gate doors swing slowly inward, revealing the tall unlit Christmas tree in the courtyard beyond. She takes two natural steps through the open gate, still holding the kitten and star. End just inside the courtyard facing the tree. The castle windows already glow warmly; only the courtyard tree awaits its missing star. Two composed shots with a motivated location cut, genuine movement and fabric motion, no face transformation and no extra hands.
```


### 07 · 晶星归位

树顶晶星、满树暖灯与雪城堡。

```text
Create a 15-second landscape cinematic fantasy environment shot, 1080p, with no people. An elegant ivory-stone fairytale castle with pale blue turrets surrounds a snowy courtyard at blue hour. A very tall natural evergreen Christmas tree stands in the courtyard; a few warm gold lights are already glowing among its branches, and its crown is bare. Start close on one small golden five-pointed crystal star floating at chest height in empty space. The star rises smoothly in a spiral past frost-tipped branches as the camera follows upward. It reaches the very top and gently locks into place as the tree topper. A beautiful wave of warm gold light then travels from the lower branches all the way up the tree, illuminating the whole courtyard. Finish by slowly pulling back to reveal the complete lit tree and castle windows beneath soft falling snow. The star remains visibly fixed at the crown. Real continuous movement in the star, camera, snow and gently stirring branches. Refined practical miniature-fantasy atmosphere, blue shadows and champagne highlights, no text or logos.
```


### 08 · 小猫敲响庆典

灰白红披肩猫在舞厅拨铃。

```text
Create a 15-second landscape cinematic fairytale animal scene, 1080p. No people. A small fluffy gray-and-white kitten with a natural round face, gray striped back, white chest and paws, and a red velvet cape edged with soft ivory fur pads into an elegant empty castle ballroom at blue hour. Its eyes are natural feline proportions. The hall has cream carved stone, champagne crystal chandeliers, a polished pale marble floor, and tall arched doors leading to a snowy balcony. A tiny brass bell hangs at kitten height from a red ribbon beside the balcony doorway. In a low smooth tracking shot, the kitten walks naturally on all four paws across the floor; its tail sways softly and the red cape moves with each step. It notices the bell, pauses, sniffs, and gently taps the bell once with one front paw. The bell swings and rings. A warm golden shimmer runs through the chandeliers and the arched balcony doors slowly open. The kitten sets its paw back down, looks toward the opening, and takes several curious steps onto the balcony. Finish with the kitten safely on the broad balcony floor, looking out toward the luminous fairytale towers and the newly lit Christmas tree in the courtyard. Soft winter-blue light outside, intimate golden light inside, realistic cat weight and fur, four natural legs, continuous purposeful movement, no text.
```


### 09 · 城堡烟花

以亮起的城堡和烟花结束故事。

```text
Create the final 15-second landscape shot of a romantic fantasy film, 1080p. @Image1 is the setting reference: preserve this same ivory-stone fairytale castle, pale blue turret roofs, snowy courtyard and tall glowing Christmas tree with its single golden star at the crown. There are no people or animals in this shot. Begin on the lit tree and the castle facade at winter blue hour. A few elegant champagne-gold fireworks rise high behind the towers and open slowly into large delicate chrysanthemum flowers; a soft rose and lavender firework blooms after them. The camera makes a smooth gradual crane upward and backward, revealing the full castle silhouette, warm windows and tree as one connected physical place. Each firework has a clear rising trail, expanding flower and naturally fading sparks. Soft snow drifts close to the camera. The light reflects subtly on the snow and castle stone. In the final seconds, one beautiful broad golden firework crowns the whole castle while the tree star remains visible below, and its sparks slowly fall and fade. Refined, calm and breathtaking, not a rapid barrage. Continuous real movement, stable full-frame 16:9 throughout, no black borders, no titles, no end card and no freeze frame.
```
