# 《今晚，改道》电影制作交接

更新日期：**2026-11-12**。用户要求将现有进展交给 Claude Code，视频制作已暂停。

**可用的新剧情片段：0 条。目标 5 分 22 秒（322 秒）仍是制作计划；新电影没有合成，也没有接入网站。** 已上线的旧影片和去鸟重剪属于网站现有素材，不能计入这部新电影的完成度。

## 从哪里继续

1. 读 [完整导演稿](../../docs/malaysia-film/DIRECTOR_SCRIPT.md) 和 [连续性要求](../../docs/malaysia-film/CONTINUITY.md)。计划包含 22 段剧情、29 个明确切镜镜头，以及 4 组优先采用真正 Extend 的连续动作。
2. 读 [实际尝试记录](ATTEMPTS.md) 和 [机器可读进度](progress.json)。截至交接时，3 次已确认生成请求均失败；11 月 12 日只到登录步骤，没有提交生成。
3. 打开[现有 Google Vids 工程](https://docs.google.com/videos/d/1xqNPZ0ASqpQNVnWTWnn6-8Jmwpuc7lrp5TaCzxB7_zU/edit?scene=id.p#scene=id.p)。使用用户指定的个人创作账号；不要把工程里的默认 5 秒空白场景记成成片。
4. 先检查登录和账户额度。可正常生成后，优先做 S02 人猫互动和 S06B 面部反应；完整播放并对照真人原照，确认脸、小猫解剖结构、动作及落地接触，再决定是否批量制作。
5. 逐条生成时使用 [完整提示词](../../docs/malaysia-film/VIDS_PROMPTS.md) 和 [生成队列](../../docs/malaysia-film/generation-queue.json)。全部输出字段、源时长和批准剪入区间仍须用真正返回的素材填写。

## 已经保存的内容

| 位置 | 内容与状态 |
| --- | --- |
| [`docs/malaysia-film/`](../../docs/malaysia-film/README.md) | 已批准的导演稿、计划时间轴、29 条英文 prompt、4 组 Extend 方案、CSV 队列、道具和空间连续性 |
| [`docs/film/HUMAN_ORIGINAL.jpg`](../../docs/film/HUMAN_ORIGINAL.jpg) | 原始真人身份参考；不得用 AI 生成的人脸替代 |
| [`docs/malaysia-film/references/`](../../docs/malaysia-film/references/) | 主厅 A、准备间 B、出发平台 C 和灰白短毛猫，共 4 张原始制作参考静帧 |
| [`tonight-we-change-course.pdf`](tonight-we-change-course.pdf) | 原制作包的 6 页可视化故事预览；当前运行状态以本交接记录为准 |
| [`quality-probes/`](quality-probes/) | S02 与 S06B 原计划 prompt、实际提交过的 S02 3 秒动作测试 prompt，以及便携参考图元数据 |
| [`tools/inspect_video.py`](tools/inspect_video.py) | 下载真实视频后检查元数据、完整解码帧数并提取首/中/末帧的工具；尚无新片素材，未对新片运行 |
| [`asset-manifest.json`](asset-manifest.json) | 素材与计划文件的仓库路径、字节数和 SHA-256 |

参考图片在 `docs/` 中随源码保存，本目录直接引用，没有重复复制。原导演稿、时间轴、队列和提示词保持恢复包的原始字节；其中早期的登录状态文字和未填的 Extend 执行次数属于计划快照，当前状态以本目录 `progress.json` 和实际尝试记录为准。

## 生成控制与额度：已知和未知

最近已确认的生成失败发生于 **2026-11-11 10:30（America/Los_Angeles）**，返回 `You've hit your limits for generating videos in Vids.`。UI 模型名称为 **Omni**，不能写作“已确认使用 Veo”。时长滑块禁用并停在 3 秒，切换 720p/1080p 后仍如此；禁用原因未知。3 秒 prompt 是检查动作的临时样片，不能替代计划里 S02 的 12 秒有效剧情。

[Google Vids 官方生成说明](https://support.google.com/docs/answer/16143507?hl=en)在 2026-11-12 核实写明：相关月额度在每月 1 日太平洋时间 00:00 重置；Google AI Pro / Ultra 家庭共享可能共用额度。**如果该账号耗尽的是这里的月额度**，下一周期可推算为 2026-12-01 00:00 PST；这不是账号页面倒计时，也不是已确认的恢复承诺。具体套餐、使用量和共享状态均未核实。

11 月 12 日页面已退出登录，安全登录请求超时后没有新的可见登录成功证据，也没有提交生成。旧的“一小时后重试”任务只有执行记录和需用户处理标记，没有可核实生成结果，不计入请求或完成数。

## 必须保留的创作约束

- 梦幻城堡里的电影剧情由人物行动推进。人物保持原照身份；猫要自然、有正常四足和重量，不能用静态照片推拉或程序拼出的僵硬小猫代替。
- 她怕尖嘴动物：排除鸟、鸡、鸟形装饰、纸鸟、飞行动物及鸟叫，每条片段实看实听。
- 榴莲是她的喜好；马来西亚是两人谈过的**未来旅行愿望**。没有已经出发、已经预订或已经答应恋爱的事实。
- 男主只拍手、肩背和裁去脸的构图；未提供男主人脸参考前，不生成陌生男子正脸。
- 船在 S16 前一直系在同一码头，原石拱洞始终敞开，没有机械水门。唯一榴莲盘、三瓣果肉、两把勺、银罩与旅行册的转移按连续性表执行；不喂猫榴莲。
- 真正 Extend 只能从平台支持的真实生成片段继续。不能延长时，按 29 镜头方案明确换机位切镜，不把两个独立 Create 当作连续镜头。
- 至少 300 秒合格、正常速度的实际剧情素材才满足五分钟要求。循环、定格、慢放、加载等待和烟花停留不能补时长。
- 结尾明确说：“谭陈思仪，我喜欢你。要不要和我在一起？”随后独立邀请：“马来西亚那趟，我想和你一起去。”真实回答留给她本人。
- 手机、尤其 iPhone 微信优先；交互可选，未点击也能完整看完。上线前实测播放、开声、暂停、重播、退出和首次加载。

## 实际视频的检查办法

先获得真实下载的视频，安装 Python 3、FFmpeg 和 ffprobe，再从仓库根目录执行。`qa/S02-attempt-04` 应为新目录。

```bash
python production/tonight-we-change-course/tools/inspect_video.py \
  /absolute/path/to/downloaded-clip.mp4 \
  production/tonight-we-change-course/qa/S02-attempt-04 \
  --expected-width 1080 --expected-height 1920 --expected-fps 24
```

只在 UI 的实际请求和返回规格明确时追加 `--expected-duration`。元数据和抽样帧不能替代完整播放、听音轨及对比原照，完成后才能标记 `qa_approved: true`。下载、剪辑和验收完成后，更新队列中的真实源文件、时长、入点与出点，再生成网站时间轴。

## 还没有完成

新镜头、人脸与猫动作验收、真正 Extend 返回长度、配乐/声音与台词、全片剪辑、交互回应备用素材、网站新片集成，以及 iPhone 微信实机播放验收，全部尚未完成。现有网站继续使用原来的已上线素材。
