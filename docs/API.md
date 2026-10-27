# REST 与权限合同

所有路径前加 Jira context path（如 `/jira`）。所有请求使用当前登录 Session；没有可指定 userKey 的接口。插件 REST v2 使用 `@LicensedOnly`，另用 Jira 公开服务逐请求校验业务权限。响应为 JSON，设置 `Cache-Control: no-store, private` 和 `Vary: Cookie`。

## 私有个人偏好

基路径 `/rest/filter-gantt/1.0/personal/{gadgetId}`。

- **GET**：校验 PortletConfiguration 存在、模块完整 key 属于本插件、当前用户可浏览所在 Dashboard。按会话用户 key 读取；没有行返回默认对象，不执行写入。固定模式不返回个人覆盖。
- **PUT**：除上述权限外要求 Gadget 为 VIEWER_SELECTABLE。只允许 `selectedFilterId`（数字字符串或 null）和 `scale`（day/week/month 或 null）。当前用户须能通过 `SearchRequestService.getFilter` 访问选定 Filter。
- **DELETE**：删除当前用户当前 Gadget 的个人偏好，返回默认对象；共享配置不变。

请求示例：

```json
{"selectedFilterId":"10002","scale":"month"}
```

响应示例：

```json
{"gadgetId":12345,"selectedFilterId":"10002","scale":"month","usesDefault":false}
```

写入要求 `Content-Type: application/json`、`X-Requested-With: XMLHttpRequest` 和同源 Origin（缺失时校验 Referer）。Sec-Fetch-Site 存在时必须为 same-origin/none。使用 Jira 容器给出的外部 scheme/host/port；反向代理需正确配置 Jira proxyName/proxyPort/scheme。不会使用 `X-Atlassian-Token: no-check` 来绕过检查。REST v2 的内置检查仍然生效，需实测目标部署的额外 XSRF 要求。

错误：400 非法参数；401 未登录/用户停用；403 无 Filter 权限、固定模式写入或 XSRF 失败；404 Gadget 不存在、不是本插件或 Dashboard 不可访问（统一防枚举）；503 集群锁忙。未预料的异常由宿主 REST 映射成 500，不把堆栈或私有数据返回浏览器。

## 筛选器搜索兼容接口

`GET /rest/filter-gantt/1.0/filters?scope=favourite&query=名称&page=0`。

scope 为 favourite / mine / shared，query 最长 100 字符且不得含控制字符。每页 25 条，page 为 0 开始的页号（不是 offset），最大 9999。使用当前用户的公开 `SearchRequestService.search`、`SharedEntitySearchContext.USE`；每条结果再次执行 Filter 权限检查。shared 排除当前用户拥有的 Filter，故可能出现空页但 `hasMore=true`，应继续翻页。

返回 `values`（id/name/owner/favourite）、page、hasMore；不返回 JQL。每条收藏状态由当前用户的 FavouritesService 判定。

Jira 10.3.18 官方 `jira-rest-plugin` 中 FilterResource 未提供 `/filter/search`。本接口实现设计文档允许的兼容分支，不使用 Cloud v3 或臆测 DC 参数。

## 原生 Jira 读取

浏览器按当前 Session 调用 GET `/rest/api/2/myself`（用户时区）、`/field`、`/filter/{id}`，POST `/search`。JQL 仅为严格校验后的 `filter = <ID>`，保留 Filter 自己的排序语义，分页串行，默认 500/硬上限 1000。分页结束再确认 Filter 访问权。用户切换 Filter、刷新、切后台或销毁时清除旧图表并中止旧请求；回到前台重新查权限。HTTP 429/503/超时提示手动刷新，不自动重试风暴。

请求显示及同步必需字段，包括 updated 快照、原始预估和负责人；开启层级/依赖才请求 parent/issuelinks。显示连线限于可见任务。同步服务另用当前用户权限读取实际 Blocks 前置任务；未完成前置任务不在本次排期时拒绝计算。未排期与错误日期独立显示；只读显示不补日期、不交换起止，不推断完成状态的百分比。

## Jira 排期同步 (1.2.0)

1.2.2 新增 POST `/rest/filter-gantt/1.0/schedule/{gadgetId}/source`，正文仅允许 filterId（数字字符串）和 issueIds（至多 1000 个唯一数字字符串）。同源 JSON 与当前用户的 Dashboard/Filter/Issue 浏览权限逐项校验；不写任务或 AO。返回每项 issueId、完整 updatedMillis 和实际任务字段 source（负责人、估时、起止日期、状态等），前端以同一份实际任务快照初始化编辑稿。搜索索引中的 updated 可能只有秒精度，禁止用它作为毫秒并发令牌。应用仍严格比较完整毫秒，不按秒取整、不在保存前替换令牌来掩盖真实冲突。

旧版 `/plans` 资源已移除，无新建、复制、选择或保存独立计划接口。

- GET `/rest/filter-gantt/1.0/schedule/{gadgetId}?filterId=<ID>`：返回 canEdit/reason、revision、order、calendarRevision、全局工作日设置及 Jira 工时单位，不创建数据。canEdit 以仪表盘所有者及日期字段类型判断，具体任务权限仍需预览校验。
- POST `/rest/filter-gantt/1.0/schedule/{gadgetId}/preview`：计算日期并调用 Jira 原生更新校验，返回 tasks/changeCount/settings，不更新任务或 AO。
- POST `/rest/filter-gantt/1.0/schedule/{gadgetId}`：重新计算并逐任务调用 Jira `IssueService` 更新，返回 results/allSaved/preferencesSaved/revision；完成后浏览器重新查询 Jira。

正文仅允许 filterId（数字字符串）、revision（整数）、calendarRevision（全局日历版本，整数）、startDate（YYYY-MM-DD）、calendar、tasks。calendar 为前端绘图快照，服务端忽略其规则，依据 calendarRevision 校验后从全局日历读取 weekdays、holidays、workDates；实际用户时区和 h/d/w 换算由服务端读取。每任务仅允许 issueId、assigneeKey、estimate、note、notBefore、locked、startDate、endDate、updatedMillis（Jira updated 毫秒字符串）。锁定日期、完成状态、Blocks 前置关系从实际 Jira 读取。估时支持组合 h/d/w/m，按分钟取整。note 是本次新增 Jira 评论，非私有备注或既有评论覆盖。

写入要求仪表盘所有者、可浏览 Dashboard/Filter/Issue、同源 JSON；原生更新校验负责项目编辑、分配、截止日期、评论和编辑界面规则。不接受客户端指定执行人或创建者，不跳过界面检查。开始/结束须为两个不同的可写日期字段，支持 duedate 及原生自定义日期/日期时间字段。created/updated 不可写。原始预估变化时保留已耗工时，并更新剩余预估为 max(原始预估 - 已耗工时, 0)；旧版工时模式限制已记录工时任务。

全批次先校验，再逐项复核并应用。revision 或 updatedMillis 不匹配返回 409；参数/字段/权限校验失败返回 400，不开始写入。应用途中失败则返回已保存 saved、失败 failed、未执行 notAttempted 的逐项结果，不伪称整批回滚。排期接口仅保存排序和 revision，不能修改全局日历，失败时 preferencesSaved=false，已更新的 Jira 任务不受 AO 回滚影响。插件集群锁覆盖同 Gadget/Filter 和同 Issue；外部 Jira 编辑仍可能发生在校验与更新之间，不承诺跨来源原子更新。网络结果未知不自动重试。

浏览器另调用 GET `/rest/api/2/user/assignable/search?issueKey=...&username=...&startAt=0&maxResults=30` 搜索负责人，GET `/rest/api/2/issue/{key}/comment?maxResults=5` 查看评论，均使用当前用户权限。

## 全局工作日历 (1.3.0)

- GET `/rest/filter-gantt/1.0/calendar`：当前获许可登录用户读取，不写 AO。返回 revision、canEdit、calendar（weekdays、holidays、workDates）。无记录时周一至周五、例外日期为空，版本 0。
- PUT 同一路径：仅 Jira ADMINISTER 或 SYSTEM_ADMIN 权限，要求同源 JSON/XSRF 防护。正文严格为 `{revision, calendar:{weekdays, holidays, workDates}}`，拒绝其他字段。工作日 ISO 1-7 至少一天；两种例外日期各最多 500 个合法日期，不可交集。
- 一个全局唯一身份行，AO namespace 保持不变；集群锁内检查版本与权限，成功版本加一。无权限 403，过期版本 409，非法值 400，锁忙 503。普通仪表盘所有者无权修改全局规则。
- 排期预览和应用要求匹配全局版本；每次实际任务写入前再次校验。途中日历变化停止后续写入并返回部分结果，先前已写任务不回滚。保存日历本身不重新排期或写入 Jira Issue。
- 旧 SCHEDULE 日历列不再读取或写入，避免将某个 Gadget 的个人规则隐式推广到全站。

## 1.3.1 同步后的局部核实

写入后不再重载整个 Gadget 或重新调用完整 Search 分页。前端重新读取 schedule 元数据与 source，校验当前用户权限，取得实际字段、排期版本、全局日历版本及完整 updatedMillis，然后更新现有图表。人员/状态筛选、刻度、折叠、选中及滚动状态保留。完整 Filter 成员变化由手动/定时刷新重新查询。

任务保存部分成功或响应丢失时同样核实实际任务，不自动重发写入或评论。核实失败保留原界面、显示未确认提示并禁止继续修改，手动刷新后恢复。若权限被撤销则清除任务显示，不保留已无权查看的数据。没有放宽原并发、权限或字段更新校验。
