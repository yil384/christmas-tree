# Fluffy Beast 六猫互动

## 当前状态

用户在 2026-11-13（America/Los_Angeles）选定 D：Fluffy Beast 的 **Low Poly Stylized Kittens**，要求全部小猫出现在圣诞场景，并有猫与猫之间的嬉戏打闹。

**真实商品模型尚未取得，本站尚未替换为 D。** 这条开发分支保存可复用的行为编排、资源校验、骨架动画播放和 React 组件。`FluffyKittens` 尚未挂载到线上场景，没有伪造的商品模型、贴图、动画名或效果截图。线上继续是 v27；不得把此准备工作报告为六猫已上线或动画观感通过验收。

## 作者素材与六只猫

[Fab 商品](https://www.fab.com/listings/7d5310a0-089a-4fdc-8f3e-5da679d23eae) · [Unity 商品](https://assetstore.unity.com/packages/3d/characters/animals/mammals/low-poly-stylized-kittens-350174) · [作者动画演示](https://youtu.be/CVLPaGnShjY)

| 实例 ID | 官方毛色 | 基础模型 |
| --- | --- | --- |
| `tuxedo-a` | 黑白燕尾服 1 | 短毛 |
| `tuxedo-b` | 黑白燕尾服 2 | 短毛 |
| `black` | 纯黑 | 短毛 |
| `orange` | 橘色 | 短毛 |
| `calico` | 三花 | 长毛 |
| `birman` | 伯曼 | 长毛 |

三种眼睛颜色是同一只猫的可选外观，不扩张成 18 只。作者公开动画类别包含 walk/backwards、trot、gallop、jump、pounce、paw slap、sit down、lie down、sleep 和 idle；42 条动画含原地/根运动版本，不能等同于 42 个独立动作或现成双猫互动。真实 clip ID 需从购得文件检查。

## 已准备的接入代码

- `src/scene/kittens/kitten-pack.ts`：区分未配置、无效配置和可供实际资源检查的配置；六种毛色必须齐全，拒绝缺模型、错材质、未知动画引用和危险 URL。再以真正加载的模型核对网格、材质槽、动画名与时长。
- `src/scene/kittens/kitten-social.ts`：六个独立角色的错峰休息、走动、追逐、轻拍与扑玩意图；点击关注、手势触发、暂停与减少动态效果。它只编排位置和行为，不能证明作者骨骼动画的最终视觉质量。
- `src/scene/kittens/kitten-runtime.ts`：读取内嵌贴图的 GLB、独立克隆每只猫的骨架与动画播放器，复用几何和贴图；按实测步速匹配位移和动画，使用作者动作做过渡，不挤压身体或用程序摆腿替代原动作。
- `src/scene/kittens/FluffyKittens.tsx`：将真实模型和互动编排连接到现有 Three.js 雪地与触摸/手势输入；为六只猫提供接触阴影。必须取得资源、填写真实 manifest 并完成视觉检查后再挂载。

## 需要的唯一外部输入

上传合法购得的**原始模型压缩包，优先 Blender 版本**，保留两种模型、所有毛色/眼睛贴图、骨架、动作和原始说明。已有 Unity 版时，原始 `.unitypackage` 也可；不要求重复购买或由用户手工导出。商品截图、视频、独立 prefab 或材质文件不等同于模型源文件。

Fab 列出的 Blender 文件由 Blender 4.4 创建。先核对本地 Blender 版本；导出已有动作不需要盲目启用控制 rig 的 Python 脚本。选择烘焙的 game rig 与 In-Place 动画，再导出带贴图的 GLB。

## 取得文件后的实际完成步骤

1. 检查两种模型、全部六套外观及动作；记录实际节点、材质、clip 名称和时长。保留原作者的形体与手绘纹理。
2. 以**统一比例**确定身体尺寸、朝向和脚底高度，测量 walk/trot/gallop 正常播放时的世界位移速度；使用足够接近原速的播放速率。
3. 导出两份可共享几何/动画的模型或六份独立 GLB，嵌入贴图。运行时路径使用 `generated/characters/fluffy-kittens/`；`scripts/finalize-build.mjs` 会删除顶层 `dist/characters/`，不要把运行资源放在那里。
4. 用实际资源建立 `KittenPackManifest`，调用 `readKittenPack` 和 `validateKittenAssetInspection`。配置状态 ready 只代表格式正确，不能代替实际文件检查。商业原始文件和转换模型不得直接提交到公开 GitHub。
5. 在 `TreeScene` 中接入 `FluffyKittens`，替换单猫组件并关闭旧单猫的地面阴影。正确传入 paused/active/reducedMotion、handInput 与 onInteract。按作者真实动作时长调整扑玩/轻拍时序，检查追逐转向、停步、起身与地面接触。
6. 验证六只猫均可见且不同毛色正确；平时休息与活动错开，最多一对高速追逐。不得用删猫来满足手机性能。检查触摸不会误转场、隐藏页面不追帧、减少动态效果静止。
7. 在实际 WebGL 中看侧面/正面步态和配对动作，验证手机性能，然后按 Sites 官方源码、构建与发布流程完成发布。保留 `/letter/`、`/christmas/`、95 张照片、已确认的相纸灯光和 favicon。

特别需要按原素材完成的动作衔接：从坐下、趴下或睡眠恢复走动时，应先起身，再产生水平位移。当前通用播放器只有动作混合，尚未接入作者具体的起身/反向过渡；0.24 秒混合本身不能证明这一步自然。扑玩也必须核验实际前爪伸展距离、身体起落与玩伴反应，不能只凭平面间距通过就发布。

## 验证的边界

本轮准备代码已通过 TypeScript 项目检查和 `npm test`：**278 项通过，0 失败，0 跳过**，其中新增 29 项覆盖资源契约、六个独立骨架播放器和社交控制器。社交测试包含 240 秒连续模拟，检查成功发生的互扑/轻拍/追逐、间距、面向、无侧滑、最多两只快跑、点击和暂停恢复。这些是逻辑与资源管理检查，未运行真实 D 模型的 WebGL 视觉验收。

代码测试可以验证身份、资源引用、骨架独立性、路径连续性、暂停和配对间距。**它们不能验证还没拿到的 D 模型是否可爱、作者动画是否自然，或六猫在真实手机上的帧率。** 合成测试骨架只用于代码验证，不显示给访问者，也不冒充商品模型。
