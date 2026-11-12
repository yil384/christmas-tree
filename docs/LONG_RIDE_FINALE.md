# 城堡巡游终幕与音乐

制作日期：2026-11-09。正式体验为 18 段生成镜头剪辑的 228.5 秒影片，随后自动接 90 秒实时 3D 演出，合计 318.5 秒。影片与实时部分均以正常速度推进，不重复影片，不将静帧停留计作额外生成视频。

## 视频生成的实际边界

Google Vids 当前界面使用 Omni 模型。18 段竖屏视频已生成并逐段下载，均为 1080 × 1920、24 fps、视频轨 15 秒。第 19、20 段提交后，界面明确返回 `You've hit your limits for generating videos in Vids.`，未获得对应视频。没有绕过额度或更换账号继续生成。剩余结尾改为独立的实时 3D 演出。完整剪辑点与原始提示词见 `LONG_RIDE_EDIT_LIST.json` 和 `LONG_RIDE_CLIP_PROVENANCE.json`。

## 终幕画面

背景 `public/journey/finale-palace.webp` 由内置 image_gen 生成，参考首张月光城堡图，沿用粉白石材、青蓝屋顶、香槟金装饰、花园与湖水。画面从湖对岸露台望向城堡，留出上方夜空供实时灯笼和烟花演出，不含生成的人物、文字或已经烘焙的烟花。

原始 PNG：`long-ride-assets/07-finale-palace.png`，对应工具输出 `generated_images/exec-d1244b0a-d258-48fa-b793-b58b00e877e8.png`。实际尺寸为 941 × 1672。WebP 质量 92，没有放大、拉伸或透视扭曲。

图像本身保持固定；Three.js 绘制具有透视、材质、光照和独立运动的灯笼、蝴蝶、花瓣与烟花。灯光位置和水面反射按真实背景坐标对齐。90 秒演出由播放器的统一时钟驱动，暂停、seek、切到后台均与主体验同步。

| 局部时间 | 演出 |
| --- | --- |
| 0–15 秒 | 3 秒平滑转场，园灯及水面反光逐渐唤醒 |
| 15–35 秒 | 48 盏立体纸灯笼分三层距离升空 |
| 35–55 秒 | 蝴蝶、花瓣与蝴蝶星座 |
| 55–85 秒 | 19 个独立烟花事件：球形、环形、棕榈、金柳与水面反光 |
| 85–90 秒 | 烟花消散，保留城堡与湖面的安静余光 |

## 实际生成的终幕配乐

Google Vids 音乐工具界面标注 Lyria 3.5，模式为 Full / Instrumental。生成结果在界面显示 90.133 秒，导出后的媒体轨为 90.046984 秒。使用正常的 Export to Drive 功能导出，再从 Drive 的 Edit with Google Vids 导入媒体播放器，通过可见视频元素下载。导出文件确实含双声道 AAC 音轨，不用空白视频替代成片。

制作项目：<https://docs.google.com/videos/d/1-xvC76Ih-iyJb2KMZssNs2IS-NYLNhvTrWI-QIm-qOY/edit>

原声归档项目：<https://docs.google.com/videos/d/1rF0KA2JayT5yWOeDSkh35-R8Ilnx9zZaSDzV3loSZrs/edit>

配乐原始导出：`finale-score-export.mp4`。网站使用 `public/journey/finale-score.m4a`：AAC、48 kHz、双声道、160 kbps、准确 90.000 秒、1,828,240 字节。两遍 loudnorm 的目标为 −18 LUFS / −4 dBTP，另做 0.5 秒淡入、最后 2 秒淡出。首个用户点击解锁声音，片尾前预载，终幕开始后按局部时钟播放。

### 实际音乐提示词

```text
Create a beautiful original 90-second instrumental orchestral finale for a luxurious first-person princess-castle dark ride at night. Elegant animated-feature fairy-tale score, warm and wondrous, no vocals, no lyrics, no narration, no pop beat. One continuous developing composition in a flowing 3/4 feel. 0–15 seconds: intimate celesta, harp arpeggios and soft shimmering strings as garden lamps awaken beside a quiet lake. 15–35 seconds: a lyrical rising woodwind and violin melody as golden lanterns lift into the sky. 35–55 seconds: delicate music-box sparkles, a graceful waltz with softly swelling strings as butterflies form stars. 55–82 seconds: a majestic but gentle orchestral fireworks climax, warm French horns, sweeping strings, cymbal swells kept soft, rich major harmonies with a memorable recurring melody. 82–90 seconds: complete tender cadence, harp and celesta resolving into a quiet sparkling lake, end naturally. Clear spacious production, no abrupt cuts, no heavy bass, no harsh percussion, never bombastic or melodramatic. Entirely original music; do not quote any existing film score. Aim to complete the musical story and resolution by 90 seconds.
```
