# 主域名与季节入口

更新日期：2026-11-09。

## 已发布与域名状态

- `tanchensiyi.com` 已由用户在 Squarespace 添加 DNS 记录。2026-11-09 原生域名状态、提供商验证与 SSL 均为 active，并已通过浏览器实际打开 HTTPS 首页。
- 本轮改版前的公开部署为 **v21**；本轮将 `/` 与 `/letter/` 的纸艺告白重做为手机竖屏城堡夜游，保留 Christmas 页面及其完整短片。改版说明与实际影片来源见 `docs/PRINCESS_RIDE.md`。
- `www.tanchensiyi.com` 尚未配置，请使用不带 `www` 的正式域名。后续维护无需重新登录 Squarespace 或改动现有 DNS。
- 此记录不含 DNS 验证 token、账号凭据或密钥。

## 固定入口

| 地址 | 用途 | 季节切换影响 |
| --- | --- | --- |
| `https://tanchensiyi.com/` | 呈现城堡夜游告白，圣诞时切换为圣诞树。 | 由共享生效时间选择首页。 |
| `https://tanchensiyi.com/letter/` | 永久保留表白页面。 | 不随首页切换。 |
| `https://tanchensiyi.com/christmas/` | 永久保留圣诞树页面。 | 不随首页切换。 |
| `https://jimeixiaomiao.wildmole.chatgpt.site/` | 原站首页继续呈现 Christmas。 | 不受主域名生效日期影响。 |

显式 `/letter/`、`/christmas/` 路由优先于域名与日期判断，末尾有无斜线均可识别。固定内容入口在首页换季后仍保留。

## 日期配置与任务状态

配置文件：`src/lib/experience-route.ts`。

```ts
export const CHRISTMAS_LAUNCH = Date.parse('2026-12-25T00:00:00+08:00');
```

项目采用此前已明示的默认时间：**北京时间 2026-12-25 零点**。用户尚未回答时区问题，这不代表其个人时区已确认。现有前端按共享时间戳选择主入口；下方云任务用于到时检查并在必要时修复，不等同于未来切换已经验证成功。

### 已创建的单次云任务

- 标题：`切换思仪的圣诞主页`。
- ID：`Automation_4dca7edb9e40819190ebcdb7e52334ca`；后续先读回、更新此任务，避免重复创建。
- 时区：`Asia/Shanghai`；按项目默认设置，不标为用户确认的个人时区。
- API 已确认**保存成功并启用**；`next_run_time` 当前返回 `null`。任务尚未执行，未验证未来运行或站点切换结果。

```text
DTSTART;TZID=Asia/Shanghai:20261225T000000
RRULE:FREQ=YEARLY;COUNT=1
```

`COUNT=1` 表示仅执行一次。若用户之后明确其他日期或时区，同步调整此任务与源码中的生效时间，再读回确认。

## 云任务执行与后续维护指引

1. 使用 Sites `get_site` 获取站点，再通过 `create_source_repository_write_credential` 和官方 `site-workflow` 打开最新源码。只使用站点源码权限，不登录 Squarespace 或 Google，不改 DNS，不购买模型。
2. 对 `experience-route` 运行针对性的单测：暂定北京时间 12 月 25 日零点主域名选 `christmas`；固定 `/letter/` 始终保留；legacy 主域名首页始终为 Christmas。日期或时区获确认后，以确认值为准。
3. 若日期路由已正确，**无需重新发布**。若确需修复，按 Sites 官方 build、save、deploy 流程完成，并保留 **public audience**。
4. 后续维护先按上述 ID 读回原生任务记录，确认启用、时区和单次日程；只更新已有任务，避免重复排程。任务执行后读回 Sites 原生状态，报告测试结果、是否变更、是否发布及真实结果，不以请求已发出代替成功。当前创建成功不能写成执行成功，`next_run_time: null` 也不能推断为已取消或已执行。

表白内容以用户明确提供的心意和素材为准；不编造相识日期、约会经历、双方关系状态或私人笑话。城堡夜游的人物参考沿用本项目已经使用、用户要求保持一致的真人照片。
