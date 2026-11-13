# 主域名与固定入口

更新日期：2026-11-13。

## 本次决定

用户要求现在把 `tanchensiyi.com` 主站恢复成 `/christmas/` 的照片圣诞树。
原先等待北京时间 2026-12-25 零点的安排已被这一新要求取代。
`src/lib/experience-route.ts` 不再读取设备日期或域名；只有显式 `/letter/` 选择告白，其余默认选择圣诞树。
`src/SeasonalEntry.tsx` 不再设置季节轮询计时器。

## 固定入口

| 地址 | 当前行为 |
| --- | --- |
| `https://tanchensiyi.com/` | 直接打开照片圣诞树。 |
| `https://tanchensiyi.com/christmas/` | 固定圣诞树入口。 |
| `https://tanchensiyi.com/letter/` | 固定城堡夜游与告白入口。 |
| `https://jimeixiaomiao.wildmole.chatgpt.site/` | 原站首页继续打开圣诞树。 |

末尾有无斜线均可识别。构建生成 `dist/letter/index.html` 与 `dist/christmas/index.html`，分别保留自己的标题、分享说明、封面和 URL。首页与 Christmas 入口使用圣诞信息。

## 既有自动任务

现有单次任务 `Automation_4dca7edb9e40819190ebcdb7e52334ca`（`切换思仪的圣诞主页`）仍安排在 Asia/Shanghai 的 2026-12-25 00:00。本次没有修改任务日程。

它的首页切换目标在本版本提前实施。未来运行时应读本文件和当前源码，验证首页是圣诞树、两条固定入口可用。若均正确，仅报告检查结果，不重新部署、不恢复旧日期条件、不重复建立任务。任务是否实际运行必须以当时的原生记录为准。

## 维护和发布

1. 使用 Sites `get_site` 与 `create_source_repository_write_credential`，通过官方 `site-workflow` 打开同一站点最新源码。保留 `.openai/hosting.json` 的项目身份与公开访问设置。
2. 路由测试应验证首页立即选择 Christmas、固定 `/letter/` 仍为告白；不再要求任何未来日期切换。
3. 需要更新时用相同源码提交构建、保存与部署。GitHub main 与 Sites 源码须同步；GitHub Pages 的历史预览并非正式站点。
4. 无须重登 Squarespace、修改 DNS 或购买模型。历史裸域名 HTTPS 已启用；本文没有重新审计 `www`。

表白内容以用户提供的素材和心意为准；不编造双方经历或关系状态。95 张原始照片、现有影片和固定告白入口继续保留。
