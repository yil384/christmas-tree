# 长篇城堡巡游：图像资产来源

生成日期：2026-11-09。

## 美术与用途

六张正式环境关键帧用于至少五分钟的第一人称城堡巡游。统一采用粉白/淡玫瑰石材、青蓝塔顶与穹顶、香槟金曲线、新月细节、玫瑰与玉兰、靛蓝夜色及暖金光线。所有画面无真人、无生成脸、无故事台词、无品牌 logo、无圣诞装饰。小船前沿作为连续视角锚点；大多数场景有明确向前的路线。

生成器为内置 `image_gen.imagegen`，不是 Veo 视频生成器。这些文件是静态关键帧，后续动态镜头需另行生成，不把静帧移动称为真实视频运镜。

## 文件与实际尺寸

| 序号 | 场景 | 项目文件 | 实际像素 | WebP 大小 |
| --- | --- | --- | --- | ---: |
| 01 | moonlit-lake-gate | `public/journey/moonlit-lake-gate.webp` | 1051 × 1497 | 400,148 B |
| 02 | music-hall | `public/journey/music-hall.webp` | 1054 × 1492 | 452,408 B |
| 03 | star-library | `public/journey/star-library.webp` | 941 × 1672 | 540,958 B |
| 04 | crystal-river | `public/journey/crystal-river.webp` | 1054 × 1492 | 469,492 B |
| 05 | moon-garden | `public/journey/moon-garden.webp` | 941 × 1672 | 484,774 B |
| 06 | royal-ballroom | `public/journey/royal-ballroom.webp` | 1054 × 1492 | 444,738 B |

所有提示词要求 9:16，但生成工具实际输出了上述尺寸；只有 03 / 05 接近该比例。没有把其他图片拉伸成 9:16，也没有借上采样冒充高分辨率。Google Vids 生成新的动态镜头时需统一使用 Portrait。

WebP 使用现有 Sharp 编码：`resize({width:1080, withoutEnlargement:true}).webp({quality:87, effort:6})`。不放大、不裁切、不改变透视。各 PNG 的实际宽度都小于 1080，因而 WebP 与原图尺寸相同。

## 原图位置与参考关系

稳定原图目录：`/workspace/scratch/7dbdec9a2b48/long-ride-assets/`。

- 01：`01-moonlit-lake-gate.png`，工具原始输出 `/workspace/scratch/7dbdec9a2b48/generated_images/exec-3026db42-f005-46dd-b54b-9fc8c588cad5.png`。
- 02：`02-music-hall.png`，工具原始输出 `/workspace/scratch/7dbdec9a2b48/generated_images/exec-434ab303-cf2e-4cfa-a516-1548d7a64f00.png`。
- 03：`03-star-library.png`，工具原始输出 `/workspace/scratch/7dbdec9a2b48/generated_images/exec-0f169fee-817e-490b-b146-fc13e5cd3498.png`。
- 04：`04-crystal-river.png`，工具原始输出 `/workspace/scratch/7dbdec9a2b48/generated_images/exec-44101c10-a0c0-4b5e-883f-c846a505d96d.png`。
- 05：`05-moon-garden.png`，工具原始输出 `/workspace/scratch/7dbdec9a2b48/generated_images/exec-4be7b30c-c8c0-411e-8439-5f48e45218c7.png`。
- 06：`06-royal-ballroom.png`，工具原始输出 `/workspace/scratch/7dbdec9a2b48/generated_images/exec-6130a938-6eaf-4386-837a-918204cd1e80.png`。

01 是全新生成，无图像参考。02–06 均使用 01 的 PNG 作为世界设计与渲染参考，`transparent_background:false`。工具原始输出保留，项目仅引用优化后的 WebP。

## 视觉检查

六张全部实际打开检查。画面空间清楚、细节锐利，夜空、室内、地下河与花园的建筑和色彩连贯。音乐厅有钢琴、管风琴与悬浮弦乐器；星空图书馆有悬浮书籍和机械星盘；地下河有透明水晶、沿水面延伸的光线；月光花园有透明大花瓣；舞厅保留空地和可通过的露台门。未发现人物、文字段落、界面框或水印。音乐厅中的发光音符是场景装饰，不是页面文案。

## 实际生成提示词

### 01 · moonlit-lake-gate

```text
Use case: stylized-concept.
Asset type: final full-frame environment keyframe for a first-person enchanted castle boat ride, portrait 9:16.
Create an exquisite cinematic frame from a lavish original 3D animated fairytale feature. A calm midnight-blue canal carries the viewer toward a luminous princess castle through a living garden. The castle has pearl-white and pale rose stone, graceful curved turquoise-blue rooftops, slender asymmetrical towers, amber-lit windows, gold tracery and subtle crescent motifs. It feels enchanting and welcoming, with elegant handcrafted curves and playful impossible scale. In the foreground, clear water fills the lower third; clusters of pink roses and pale magnolias on low curving islands frame the route, and delicate gold lanterns hang over the canal. A thin trail of floating gold fireflies leads through a low pointed arch in the castle. The viewer is gently floating at seated eye height just above water, 35mm lens, convincing near-to-far perspective and a continuous navigable waterway. Only a tiny ivory-and-gold curved rim of the boat may appear at the very bottom.
A large soft moon, deep indigo sky, violet-blue shadows, warm amber light, blush roses, crisp jewel-like reflections. Polished cinematic 3D animation materials, physically plausible lighting, sculpted plants, rich depth, delicate volumetric light but no murky fog, beautifully readable architecture. The entire portrait frame is an immersive environment, not a page layout. No people, human faces, statues of people, writing, words, logo, interface, border, snow or Christmas decorations. Avoid photo-real-estate rendering, beige monochrome, flat illustration, low-poly geometry, toy plastic, gaudy neon, blur and excessive bloom.
```

### 02 · music-hall

```text
Use case: stylized-concept. Final immersive environment keyframe for an original princess castle dark ride. VERTICAL PORTRAIT 9:16, ideally 1080 by 1920, one uninterrupted frame, no collage. Use the supplied image only as a world-design and rendering reference: the same pearl-white/pale rose stone, graceful turquoise-blue curves, champagne-gold scrollwork and crescent motifs, pink flowers, rich midnight-blue shadows, warmly luminous windows, gorgeous stylized 3D animated-feature quality. Do NOT copy its outdoor composition into this new scene. Seated first-person ride camera about 1.2 metres high, subtle wide angle with genuine spatial depth, a clear path leading through the frame. Rich but tasteful jewel colours, clear fine detail, convincing layered material and light, readable highlights, no foggy blur. No people, human faces, anthropomorphic furniture faces, human statues, writing, readable book text, logo, UI, border, snow, or Christmas. No real estate photograph, beige monochrome, toy-plastic, low-poly, neon overload, excessive bloom. Scene: a soaring enchanted music hall inside this castle, where a monumental gold and pearl pipe organ curves upward like an open seashell beneath a deep cobalt vault. Its decorative pipes have turquoise enamel, little crescent finials and thin gold scrollwork. A graceful ivory grand piano on a circular rose-stone floor is playing by itself; its keys and a few small floating gold light ribbons imply a magical melody. Tall rose-coloured arched doors and moon-blue windows flank the room. Crystal chandeliers and warm candles create jewel-like reflections on the polished floor. A few self-playing string instruments hover gently above a side alcove, with no visible hands, creatures or human silhouette. Camera glides forward through the centre aisle into an elegant, fantastical, delightfully alive space. Beautiful operatic scale, magical and playful rather than solemn. Keep the route unobstructed.
```

### 03 · star-library

```text
Use case: stylized-concept. Final immersive environment keyframe for an original princess castle dark ride. VERTICAL PORTRAIT 9:16, ideally 1080 by 1920, one uninterrupted frame, no collage. Use the supplied image only as a world-design and rendering reference: the same pearl-white/pale rose stone, graceful turquoise-blue curves, champagne-gold scrollwork and crescent motifs, pink flowers, rich midnight-blue shadows, warmly luminous windows, gorgeous stylized 3D animated-feature quality. Do NOT copy its outdoor composition into this new scene. Seated first-person ride camera about 1.2 metres high, subtle wide angle with genuine spatial depth, a clear path leading through the frame. Rich but tasteful jewel colours, clear fine detail, convincing layered material and light, readable highlights, no foggy blur. No people, human faces, anthropomorphic furniture faces, human statues, writing, readable book text, logo, UI, border, snow, or Christmas. No real estate photograph, beige monochrome, toy-plastic, low-poly, neon overload, excessive bloom. Scene: an astonishing circular royal library several stories tall, shaped around an open central atrium. Curved dark teal and warm walnut bookshelves spiral upward beneath a transparent sapphire-blue star dome. Fine gold stair rails, pearl stone balconies, small crescent lamps and a suspended golden mechanical armillary sphere echo the reference castle. A few richly bound books float slowly on an elegant spiral around the sphere; open pages contain only tiny star constellations without letters. Moonlight pours through a tall pointed window, mixing with amber desk lights. The first-person ride route curves around the central armillary and leads toward a mysterious luminous arch at the back. Exquisite intimate detail with grand depth, truly dimensional shelves and ornaments. Warm wonder, no spooky faces, no clutter blocking the route.
```

### 04 · crystal-river

```text
Use case: stylized-concept. Final immersive environment keyframe for an original princess castle dark ride. VERTICAL PORTRAIT 9:16, ideally 1080 by 1920, one uninterrupted frame, no collage. Use the supplied image only as a world-design and rendering reference: the same pearl-white/pale rose stone, graceful turquoise-blue curves, champagne-gold scrollwork and crescent motifs, pink flowers, rich midnight-blue shadows, warmly luminous windows, gorgeous stylized 3D animated-feature quality. Do NOT copy its outdoor composition into this new scene. Seated first-person ride camera about 1.2 metres high, subtle wide angle with genuine spatial depth, a clear path leading through the frame. Rich but tasteful jewel colours, clear fine detail, convincing layered material and light, readable highlights, no foggy blur. No people, human faces, anthropomorphic furniture faces, human statues, writing, readable book text, logo, UI, border, snow, or Christmas. No real estate photograph, beige monochrome, toy-plastic, low-poly, neon overload, excessive bloom. Scene: a secret underground river beneath the same enchanted castle. The first-person boat has entered a magnificent cavern whose ceiling arcs like a natural cathedral. Clear sapphire water curls into the distance between beautifully formed translucent violet, pale turquoise and rose quartz crystal clusters. Delicate champagne-gold natural mineral veins and small ancient pearl-stone castle arches reveal that this cavern belongs to the royal world above. Blue-violet ambient light passes physically through the crystals while tiny warm gold fireflies guide the boat through the middle. Several luminous water lilies sit low near the water, delicate reflections stretch toward the camera, and a distant round moonlit opening suggests an exit ahead. Only a tiny pale gold rim of the boat at the very bottom. Elegant, serene and magical, never scary, no cave monsters. Not a neon nightclub; preserve a soft rich palette and crystal transparency.
```

### 05 · moon-garden

```text
Use case: stylized-concept. Final immersive environment keyframe for an original princess castle dark ride. VERTICAL PORTRAIT 9:16, ideally 1080 by 1920, one uninterrupted frame, no collage. Use the supplied image only as a world-design and rendering reference: the same pearl-white/pale rose stone, graceful turquoise-blue curves, champagne-gold scrollwork and crescent motifs, pink flowers, rich midnight-blue shadows, warmly luminous windows, gorgeous stylized 3D animated-feature quality. Do NOT copy its outdoor composition into this new scene. Seated first-person ride camera about 1.2 metres high, subtle wide angle with genuine spatial depth, a clear path leading through the frame. Rich but tasteful jewel colours, clear fine detail, convincing layered material and light, readable highlights, no foggy blur. No people, human faces, anthropomorphic furniture faces, human statues, writing, readable book text, logo, UI, border, snow, or Christmas. No real estate photograph, beige monochrome, toy-plastic, low-poly, neon overload, excessive bloom. Scene: a secret moon garden on the elevated terraces of the same castle. Large translucent white magnolia petals, blush rose blossoms and glass-like pale blue flowers arch over a flowing narrow canal and a graceful curved pearl-stone footbridge. Flowers are oversized in an elegant animated-fairytale way, with visible translucent petal veins and gold pollen sparkling in the moonlight. Through the living arches, a few familiar turquoise-roofed pale rose castle towers appear at different depths. Ivy and delicate lavender vines hang from gold crescent trellises. The sky is rich indigo and lavender, a luminous moon sits beyond the garden, warm hidden lanterns light the planting from below. Seated first-person camera gently following the water path, with inviting curves and beautiful foreground parallax. Organic abundance, exquisite glassy material, a romantic dreamlike garden with no people or figurines.
```

### 06 · royal-ballroom

```text
Use case: stylized-concept. Final immersive environment keyframe for an original princess castle dark ride. VERTICAL PORTRAIT 9:16, ideally 1080 by 1920, one uninterrupted frame, no collage. Use the supplied image only as a world-design and rendering reference: the same pearl-white/pale rose stone, graceful turquoise-blue curves, champagne-gold scrollwork and crescent motifs, pink flowers, rich midnight-blue shadows, warmly luminous windows, gorgeous stylized 3D animated-feature quality. Do NOT copy its outdoor composition into this new scene. Seated first-person ride camera about 1.2 metres high, subtle wide angle with genuine spatial depth, a clear path leading through the frame. Rich but tasteful jewel colours, clear fine detail, convincing layered material and light, readable highlights, no foggy blur. No people, human faces, anthropomorphic furniture faces, human statues, writing, readable book text, logo, UI, border, snow, or Christmas. No real estate photograph, beige monochrome, toy-plastic, low-poly, neon overload, excessive bloom. Scene: the grand royal ballroom at the heart of this original princess castle. A breathtaking circular hall with pearl-white and soft rose stone columns, delicate turquoise-blue vaulted ceiling panels, sinuous champagne-gold tracery, tall arched midnight-blue windows, and three magnificent crystal chandeliers. Inlaid marble floor creates a large empty oval dance circle at the centre, with elegant pale gold and sapphire patterns that contain no words or letters. Pink roses and climbing magnolias soften the balconies. A few long weightless ribbons of warm starlight float above the dance floor like the trace of an invisible waltz, but no human body, silhouette or face. The seated first-person camera enters from a slightly off-centre doorway, leaving a clear gliding route around the central dance circle toward open moonlit terrace doors. Lavish scale, beautiful sculpted curves, cinematic enchanted animated-feature lighting, warmly alive rather than an empty real estate showroom.
```

