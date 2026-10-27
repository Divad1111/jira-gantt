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

只请求显示必需字段；开启层级/依赖才请求 parent/issuelinks。父子与 Blocks 链只使用本次返回且已排期的 Issue，不额外读取缺失父级或依赖目标。未排期与错误日期独立显示；不补日期、不交换起止，不推断完成状态的百分比。
