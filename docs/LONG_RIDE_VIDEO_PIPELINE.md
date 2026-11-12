# 城堡巡游：真实视频剪辑与手机分片播放

日期：2026-11-09。脚本：`scripts/build-long-ride.py`。

## 2026-11-11 离线管线更新：真实长素材与有意硬切

脚本版本为 `long-ride-v4-variable-sources`。后文的 18 镜、228.5 秒影片和 90 秒终幕是旧片制作记录，不是新剧情影片的完成证明。新片要求影片本身至少 300 秒，正式构建使用默认 `--min-duration 300`、`--finale-duration 0`，不以独立终幕补足影片长度。此次管线更新没有生成、替换或发布新影片。

旧剪辑表仍兼容：不填结束点时默认保留到源片 15 秒，镜头间默认 12 帧叠化。对于真实下载的较长源片或 Extend 导出，可明确填写超过 360 的 `outFrame`，或超过 15 秒的 `out`；脚本逐文件核验真实帧数、视频和音频长度，不能只修改时间线来获得长片。

转场归属于前一镜，使用 `transitionOut: "cut"` 进行零重叠硬切；使用 `transitionOut: "dissolve"` 和正整数 `dissolveFrames` 指定叠化帧数。最后一镜没有转场。以下只展示输入格式，所列文件须真实存在且通过检查：

```json
{
  "clips": [
    {"id": 1, "file": "scene-01-extended.mp4", "inFrame": 0, "outFrame": 780, "transitionOut": "cut"},
    {"id": 2, "file": "scene-02.mp4", "inFrame": 0, "outFrame": 600, "transitionOut": "dissolve", "dissolveFrames": 6},
    {"id": 3, "file": "scene-03.mp4", "inFrame": 0, "outFrame": 480}
  ]
}
```

`plan` 默认只写 `--work-dir/planned-timeline.json`。如确需把计划写入前端源文件，必须显式添加 `--write-planned-timeline`；这不代表媒体已经生成。`build` 在实际源片、合成帧数和 HLS 验证通过后才更新 `--timeline-source`，缺片或输入校验失败不会改动正在使用的时间线。

本次隔离验收使用旧 HLS 抽取的测试素材，没有放进网站：第一源长 396 帧（16.5 秒），保留第 336–383 帧；另外两源各 60 帧，各保留前 48 帧。第一处硬切、第二处叠化 6 帧，最终为 138 帧／5.75 秒。两档 HLS 均完整解码验证通过，1080p 为 2,876,024 B、720p 为 1,432,184 B；母版 PCM 严格为 276,000 个样本。另已验证超过真实源长会拒绝、默认 `plan` 与缺片 `build` 均保留现有前端时间线。旧 18 镜表的逐镜数值时间线仍完全一致，为 5,484 帧。此验收只证明制作工具可用，不是新剧情片进度。

## 2026-11-11 旧片去鸟修订

根据确认的画面边界，现有旧片删除原时间线 **[88.5, 114.0) 秒**，包括第 8、9 镜以及与相邻镜头的混合残影。保留原 **[0, 88.5)** 与 **[114.0, 228.5)**，在新 88.5 秒处硬切。第 7 镜源片结束点由 15 秒改成 14.5 秒；第 10 镜从源片 0.5 秒开始；后续时间整体前移 25.5 秒。接缝音频各有 12 毫秒幅度渐变以避免切口爆音，不重叠，也不增加时长。

实际修订片为 **203.0 秒／4,872 帧**；既有 90 秒实时终幕保持原长，总体验为 **293.0 秒**。这是已在本地 `public` 替换的旧片修订，**不是新生成的五分钟剧情电影**。本节更新不代表已部署到线上。

`scripts/revise-ride-without-birds.py` 先把原 1080p HLS 和时间线快照到仓库外的工作目录，记录全部原文件 SHA-256；分段剪辑、母版拼接、两档 HLS 编码和完整解码验证都在仓库外进行。只有通过后，`--apply` 才整目录替换本地影片并同步前端时间线。旧目录移至仓库外工作备份，public 中不附加第二套旧影片。新 master、子列表和分片使用 `birdfree-r1` 文件名，播放器已对应实际存在的 `journey/film/index-birdfree-r1.m3u8`，防止继续命中旧鸟镜缓存。

本次实际结果：两档均为 24 fps、4,872 帧、34 个分片；1080p TS 共 95,059,380 B，720p 共 48,259,036 B；母版 PCM 为 9,744,000 个样本。旧 `segment-*.ts` 名称剩余 0 个。影片目录从 161,374,572 B 降至 143,332,775 B。接缝新第 2,123、2,124 帧已抽看，分别对应原第 2,123、2,736 帧，未见纸鸟残影；这不等于全片逐帧审片。

`scripts/verify-ride-bird-removal.mjs` 直接使用实际前端热点映射函数检查修订：第 8、9 镜热点已删，7 个前段热点不变，9 个后段热点前移 25.5 秒且空间运动参数不变；共 16 个有效热点，src/public 时间线完全一致。告白增加「马来西亚那趟，我一直记着。」后已重建原 SC 字体子集，29,740 B、221 个映射字符，新句没有缺字。实际媒体、热点、字形和体积结果记录于 `LONG_RIDE_BIRD_REMOVAL_REPORT.json`。

在本次工作目录结构中，从项目根目录可复现：

```bash
python -B scripts/revise-ride-without-birds.py --work-dir ../../bird-removal --threads 4 --master-preset fast --hls-preset medium --apply
node scripts/verify-ride-bird-removal.mjs --original-timeline ../../bird-removal/original-film/timeline.json --report ../../bird-removal/hotspot-verification.json
/usr/bin/python3 scripts/build-confession-font.py
```

已存在的工作目录会复用经过 SHA 校验的原片快照，避免对修订片再次删除。若在新环境重现，先从旧 git 版本恢复完整原片到单独目录，并通过 `--source-film-dir /path/to/original/film` 指定它；工具要求原时间线为 5,484 帧，拒绝误剪当前 4,872 帧版本。未来接入真正完成的新剧情片时，应将播放器入口对应到该新片实际验证通过的 master。

## 来源与完成范围

原始动态素材来自用户指定 Google Vids 工作流；实际界面上的生成器名称为 **Omni**。不能把这批素材标为已经用 Veo 制作。原始文件存于 `/workspace/shared/long-castle-ride/clip-01.mp4` 等路径，静态美术参考的完整来源另见 `LONG_RIDE_ASSETS.md`。

初案是 22 条各 15 秒的真实镜头，21 次 0.5 秒交叉淡化后为 319.5 秒。检查发现同组部分镜头重复从参考图构图开始，因此提出删去重复开头，并新增 23／24／25 三段衔接镜头；此 25 段方案是**未执行计划**。

生成服务随后对 19／20 返回额度用完。实际可用范围为 **01–18**，19–25 没有完成、没有被拼进成片。2026-11-09 的旧片交付结构改为：剪辑过的真实生成影片，再接独立实现的 90 秒实时 3D 灯光／烟花终幕。影片时长与总体验时长分别记录，绝不把实时 3D、静帧或缓冲时间计为“生成视频”。

`/workspace/shared/long-castle-ride/edit-list-unproduced-25-shot-plan.json` 保留未执行方案；当前剪辑决策表为同目录 `edit-list.json`。最终影片帧数、时长和文件大小以 `build/build-report.json` 与项目 `public/journey/film/timeline.json` 为准。没有生成这些验收报告之前，不把计划值视为实测完成值。

## 运行环境

- FFmpeg／ffprobe：`7.1.5-0+deb13u1`，含 libx264、libwebp、FFV1、AAC。
- 初始环境约 9 个逻辑 CPU、9.7 GiB 内存、57 GiB 可用磁盘；这是启动时观察值，非运行峰值。
- 脚本默认每个编解码器 4 线程，filter 图 1 线程；1080p 与 720p 顺序编码。
- 原片 01 实测：1080×1920、H.264、24 fps、360 帧，视频 15.000000 秒，48 kHz 双声道 AAC 15.040000 秒，容器 15.040000 秒。每个输入都再次独立验证，不能仅用容器长度判断画面长度。

## 剪辑约束与时间线

所有剪辑点对齐 1/24 秒。`in`／`out` 以原片秒数表示；也可用 `inFrame`／`outFrame` 明确整帧。结束点采用半开区间，不重复边界帧。

```json
{
  "clips": [
    {"id": 1, "in": 0, "out": 15},
    {"id": 2, "in": 4, "out": 15},
    {"id": 3, "in": 2, "out": 15}
  ]
}
```

顺序由数组决定，支持任何不重复的片号。缺少视频、原片尺寸不符、不是原生 24 fps、音频不足、重复文件 SHA-256、片段短到没有独立画面区间，均直接报错。没有视频循环、静帧补时、慢放、光流或插帧。

总影片帧数为 `Σ(outFrame − inFrame) − Σ(实际转场重叠帧数)`。旧表全部使用 12 帧叠化时，等于原公式 `Σ(outFrame − inFrame) − 12 × (镜头数 − 1)`。每个镜头的 `start` 等于上一镜头 `end − overlapOut`。`sourceIn/sourceOut` 保留原片坐标；`solidStart/solidEnd` 排除两边的淡化区间。原片某时刻 `t` 的热点换算为 `start + (t − sourceIn)`，再裁去不在剪辑内的事件。

`plan` 默认仅产生工作目录中的计划文件；正式构建同步写 `src/journey/rideTimeline.json` 与 `public/journey/film/timeline.json`，内容一致。v2 时间线中的 `crossfadeDuration` 是最大叠化时长，具体每处转场以 segment 的 `overlapIn/overlapOut` 为准。主要字段：

```text
version, fps, duration, durationFrames,
crossfadeDuration, transitionPolicy, finaleDuration, totalExperienceDuration,
segments[{shotId,file,sourceIn,sourceOut,start,end,duration,
          startFrame,endFrame,sourceInFrame,sourceOutFrame,
          overlapIn,overlapOut,transitionOut,solidStart,solidEnd}]
```

`duration` 仅是影片，`finaleDuration` 是独立 3D 实现的配置时长，`totalExperienceDuration` 为两者之和。脚本可以核验时间预算；3D 终幕确实正常运行、切换及恢复行为仍需播放器集成验收。

## 内存受控的合成方式

整个影片不会同时打开 18 或 25 路 1080p 视频。脚本把时间线分为独立正文与实际指定的叠化转场，每个转场最多同时读取两路视频。硬切只拼接相邻正文，不额外建立转场块。

1. 对每条实际选中范围，先测量音频再做两遍 `loudnorm`。目标 −18 LUFS、−4 dBTP、LRA 11；输出 48 kHz、双声道 PCM s16。真正静音的素材保留静音并在报告标记，不人为填入声音。
2. 正文与转场编码为 FFV1／yuv420p + PCM 的无损 NUT 中间文件。叠化转场使用 `xfade=fade`，默认持续 12 帧，也可逐处指定；音频使用 `acrossfade` 的 qsin／qsin 曲线，每帧重叠 2,000 个样本（默认 24,000）。硬切不进行视频或音频重叠。
3. FFmpeg 7.1 在 `trim/setpts` 后会清除恒帧率元数据，因此为 `xfade` 恢复 24 fps 标记。源片已验证为 24 fps，时间戳逐帧为 N/24；恢复标记不改变速度或创建中间画面。每个输出块再次解码核对真实帧数。
4. `acrossfade` 对两条已经规范化的完整选中音轨计算交叉淡化，然后只保留实际指定的重叠区间。这样避免本地 FFmpeg 在多路短音轨先 trim 后 acrossfade 的组合中提前 EOF。每块 PCM 样本数必须严格等于 `帧数 × 2000`。编码时间基准显式指定为 `-enc_time_base:v 1:24`，仅作用于视频，保留音频样本精度。
5. 按顺序 concat 成 1080p 母版，首段声音 1.2 秒渐入，最后 2 秒渐出。每段 −4 dBTP 为等响交叉叠加最坏约 +3.01 dB 预留约 1 dB 峰值余量；此处不加会引入延迟的 limiter，也不把源音轨峰值目标误称为最终 AAC 实测 true-peak 保证。

母版在共享目录 `build/master-1080p.mkv`：H.264 High Level 4.1、CRF 16、默认 `fast` preset、yuv420p、BT.709，音轨保留无损 PCM。母版不放进 public。中间文件以来源 SHA-256、实际裁点和参数命名并缓存，重复执行不会重复处理已完成且参数一致的块。

输出不使用 `-frames:v` 或输出端 `-t` 来提前截断多路输出：实际试验发现这可能让某些 PCM 音轨提前数毫秒结束。全部端点由滤镜中的整帧／整样本裁点控制，音频时间戳按 N/SR 重新从零计数；完整帧数与 PCM 样本数作硬性校验，错误块不会进入成片。

## 手机 HLS 输出

主列表：`public/journey/film/index.m3u8`，普通 MPEG-TS VOD 分片，供原生 Safari HLS 或 hls.js 使用。两档都由真实 1080p 母版独立顺序编码，不从 720p 放大。

| 档位 | 尺寸 | 视频平均目标 | VBV 最大值／缓冲 | H.264 | 音频 |
| --- | --- | --- | --- | --- | --- |
| 高清 | 1080×1920 | 3.5 Mbps | 4.2／8.4 Mbps | High、Level 4.1 | AAC-LC 128 kbps，48 kHz，双声道 |
| 省流 | 720×1280 | 1.7 Mbps | 2.2／4.4 Mbps | High、Level 3.1 | 同一母版音轨，AAC-LC 128 kbps |

编码器为 libx264，默认 HLS preset `medium`，24 fps，144 帧闭合 GOP。禁用场景切换造成的随机关键帧安排，显式每 6 秒设关键帧，`independent_segments` 与 `vod`。除最后一片外，每片目标 6 秒。720p 使用 Lanczos 下采样，不锐化或改变透视。

每个分片都必须非空且**严格小于 25 MiB**。构建核验播放列表总时长、文件是否存在、每片时长、ENDLIST 和独立分片标记，并完整解码每档 HLS 检查帧数、24 fps、尺寸、H.264 profile/level 与 AAC-LC。主列表的 BANDWIDTH 与 AVERAGE-BANDWIDTH 来自实际分片字节数（含音频与 TS 开销），不是把视频目标码率硬写成网络需求。

`public/journey/cover.webp` 与 `ending.webp` 均从最终母版的真实首帧／末帧提取，保留 1080×1920、WebP quality 88、compression level 6。初始封面已经先由 clip-01 第 0 帧提取用于首屏验收。右下生成标记保留，没有抹除。

## 操作

在项目根目录运行；不需要改依赖，也不调用浏览器或部署接口。

```bash
# 提前计算计划时间线；源片不齐也能运行，不会写前端时间线。
python scripts/build-long-ride.py plan --edit-list /workspace/shared/long-castle-ride/edit-list.json

# 验证当前已有原片；结果保存为 build/source-report.json。
python scripts/build-long-ride.py inspect --edit-list /workspace/shared/long-castle-ride/edit-list.json

# 仅为当前已下载素材建立无损缓存，不改变 public 影片。
python scripts/build-long-ride.py prepare --edit-list /workspace/shared/long-castle-ride/edit-list.json

# 新片源片齐、裁点确定后正式本地构建；影片须至少300秒，不会自行上传或发布。
python scripts/build-long-ride.py build --edit-list /workspace/shared/long-castle-ride/edit-list.json --min-duration 300 --finale-duration 0
```

默认影片门槛为 300 秒。为复现旧片保留 `--allow-short` 与实际独立终幕时长参数，且两者之和仍须不少于 300 秒；这不是新剧情影片的验收方式。`--min-duration 0` 仅用于隔离目录的短管线验证，不用于正式发布。脚本保留旧 public 影片到 work 备份后原子替换本地完整新影片，防止半写入列表供前端读取。

可同时运行 `python scripts/preview-long-ride.py` 做手机全程 QA：它等待主流程的同一份已验证母版，然后在独立目录编码并完整验证 720p。提前可用的入口为 `/journey/film/index-qa.m3u8`；主流程继续完成 1080p，最后正式入口仍是双档 `index.m3u8`。临时 QA 入口使用完整实际影片，不缩短或替换内容。主片与 QA 两套单路编码器合计最多 8 线程；不会打开多路原片大滤镜图。

日志与精确命令在 `build/logs/` 和 `build/commands.jsonl`；实测输出报告为 `build/build-report.json`，提前 720p QA 报告为 `build/qa-preview-report.json`。若退出，已完成缓存保留，修复原因后可用同一命令继续。

## 实际视觉质检记录

逐镜头 contact sheet 是从原片 0／5／10／14 秒取出四帧，每帧通常 360×640，一行 1440×640；明显重复者另抽 0／0.5／1／1.5／2／2.5／3 秒。它们位于共享原片目录，供剪辑和屏幕热点校准。

- 01：真实穿行花桥；水面与建筑近远视差变化清楚，无人物和文字。
- 02：睡莲展开、金光漂浮、转向玫瑰拱；前 3 秒仍重复城堡建立画面，建议 in=4。
- 03：花廊、玻璃蝴蝶、金门；2 秒起明显进入廊内，建议 in=2。
- 04：金门打开，穿行至明亮大厅；约 10 秒远处有小型黑色载具状物，非已确认人物。保留生成标记。
- 05：宫殿灯光依次点亮、前往钢琴，入场门的动作有用，in=0。
- 06：钢琴与音符、门后新空间；去掉再次远望音乐厅的开头，in=4。
- 07：机械星盘、升起的星光、书库入口；in=3。第 359 帧原始 PNG 已保存为 extend-07.png，后续配额原因未用于新增生成。
- 08：新图书馆与纸鸟，in=0。
- 09：开头 3 秒保持同一图书馆总景，in=4 后较快进入书页与星空变化。
- 10：镜廊、波纹魔镜、穿入水晶洞的明确过门，in=0。
- 11：新洞穴建立，in=0；已加抽 4.5／5／5.5／6 秒。约 5 秒是原生成片内部的一次短叠化，5.5 秒帧已清晰；未见黑帧或异常人物。
- 12／13／14：初步各 in=3，以删去同组重复建立画面。第 359 帧原始 PNG 已保存为 extend-14.png，未作新增生成。

- 15：新花园步道、花开与蝶群，in=0。
- 16：去掉重复花园总景，从灯笼升起附近开始，in=3。
- 17：新天文台外立面、望远镜、蝴蝶星座、云桥的完整过门，in=0。
- 18：去掉再次回到花园的开头，从玻璃桥附近开始，保留宫门开启及舞厅，in=4。真实末帧为金色室内大厅，远处两侧有小型石雕而非真人角色；已据此提醒终幕设计衔接，生成标记保留。

这些是逐段实际抽帧观察，不等于逐帧人工审片或完整音轨试听。最终剪辑表已固定为 18 段、删去合计 33 秒开头、17 次 0.5 秒重叠：影片 **228.5 秒／5,484 帧**，另接独立 90 秒 3D 终幕，总体验配置 **318.5 秒（5 分 18.5 秒）**。媒体原始生成参数和提示词复制到 `LONG_RIDE_CLIP_PROVENANCE.json`，剪辑表复制到 `LONG_RIDE_EDIT_LIST.json`。

隔离管线试跑已完成：两条不同原片分别保留 2 秒，交叠 0.5 秒，得到 3.5 秒／84 帧。两档 HLS 均实际解码为 84 帧／24 fps，尺寸、High profile、level 与 AAC-LC 声明相符；1080p 分片 1,599,692 B，720p 分片 815,732 B。此短试片仅在共享隔离目录，没有放进网站。正式构建已完成：两档全部实际解码为 5,484 帧／24 fps，每档 39 片，播放列表总长 228.5 秒。1080p 分片总计 106,988,356 B，最大片 3,397,348 B；720p 总计 54,375,804 B，最大片 1,733,548 B。全部远低于单片 25 MiB。1080p 母版 484,467,584 B，PCM 样本总数严格为 10,968,000。原片规范化后实测 −18.22 至 −17.74 LUFS，最高 true peak −4.0 dBTP。720p 提前编码已经安全复用于正式构建，没有重复编码。正式媒体报告复制到 `LONG_RIDE_BUILD_REPORT.json`，逐原片元数据与 SHA-256 复制到 `LONG_RIDE_SOURCE_REPORT.json`。播放器完整浏览器验收由主任务继续执行。

## 技术来源

配置以安装版本 `ffmpeg -h filter=xfade`、`acrossfade`、`loudnorm`、`setpts`、`fps` 和 `-h muxer=hls` 的实际帮助为准，并用真实输入做隔离管线验证。

- [FFmpeg 官方滤镜文档：xfade](https://ffmpeg.org/ffmpeg-filters.html#xfade)：格式、尺寸、时间基准和恒定帧率要求。
- [FFmpeg 官方滤镜文档：acrossfade](https://ffmpeg.org/ffmpeg-filters.html#acrossfade)：音频重叠时间、样本数和淡化曲线。
- [FFmpeg 官方滤镜文档：loudnorm](https://ffmpeg.org/ffmpeg-filters.html#loudnorm)：EBU R128 测量、两遍参数和 true-peak 目标。
- [FFmpeg 官方格式文档：HLS](https://ffmpeg.org/ffmpeg-formats.html#hls-2)：VOD、分片、关键帧与 independent_segments。

查阅日期 2026-11-09；生成服务配额与素材来源来自本次实际界面结果，不从这些技术文档推断。
