# Jira 10.3.18 — Filter Gantt Gadget 开发设计文档（Codex 实施版）

> **文档版本**：1.0  
> **编写日期**：2026-10-26  
> **目标平台**：Jira Software Data Center **10.3.18**；Jira Agile / Advanced Roadmaps 已安装  
> **交付类型**：可安装的 Jira P2/OSGi 插件 JAR（无独立外部 Web 服务）  
> **建议插件名**：Filter Gantt Gadget  
> **建议 Maven 坐标**：`com.qixia.jira:filter-gantt-gadget:1.0.0`  
> **建议 plugin key**：`com.qixia.jira.filter-gantt-gadget`  
> **面向读者**：Codex / Jira 插件开发者 / Jira 管理员

---

## 0. 给 Codex 的执行指令（首先阅读）

**目标**：依据本文从零实现一个可在 Jira 10.3.18 Data Center 中安装和使用的 Dashboard Item，名称为“Filter Gantt Gadget”。用户从仪表盘的“添加 Gadget”选择它，根据自己有权限访问的 Jira Saved Filter 绘制可缩放、可查看任务详情的甘特图。支持多个 Gadget 实例与共享仪表盘中的个人视图，默认只读。

**强制工程原则**：

1. **必须是真正的 Jira 插件**：使用 `dashboard-item` 模块注册到 Dashboard Gadget 目录，最终生成 JAR；不得只实现一个外部网站、浏览器插件、Standalone 页面，或依赖 Jira Cloud Forge。
2. **以 Jira 10.3.18 验证为准**：旧教程只是结构参考。编译前检查 Jira 10.3.18 可解析的依赖、Jira Platform 7 的导入包、REST v2 和安全注解；不得套用 Jira 7/8 的过时 API 而不测试。
3. **优先官方接口**：读取筛选器与 Issue 优先使用 Jira 原生 REST/公开 Java API；禁止读取 Jira 数据库来绕过权限，也不得直接访问 Advanced Roadmaps 内部表。
4. **权限不可妥协**：所有数据按当前登录用户重新进行 Jira 访问控制；不得用管理员凭据查询后把结果分发给普通用户。个人筛选器 ID 不得写进共享 Gadget Preferences。
5. **交付可运行工程**：`pom.xml`、`atlassian-plugin.xml`、Java/JS/样式/模板、前端打包脚本、许可证、测试、README、管理员安装说明与实际 JAR。不能只交示意性伪代码。
6. **失败要如实记录**：没有 Jira 10.3.18 测试环境时，应完成可执行的构建、单元测试和 mock 集成测试，并在交付报告中标注“尚未通过真实 10.3.18 安装验证”；绝不能虚报已兼容。
7. **分阶段提交**：先完成一个 Dashboard Item 正常显示；再完成 Saved Filter 查询；再绘制甘特图；最后完成个人化、权限及性能；逐阶段运行测试并提交可复现的结果。

**优先级**：P0 必须完成功能；P1 可在第一版后增强；P2 后续研究，严禁为了 P2 拖延 P0。

---

## 1. 背景、目标与边界

### 1.1 业务背景

公司使用 Jira 10.3.18 Data Center。尽管已安装 Advanced Roadmaps，但 Roadmaps 计划页与用户经常访问的 Jira Dashboard 不在同一个位置。开发者、测试、项目经理希望将自己关心的 Jira Issue 时间计划以甘特图形式直接展示在 Dashboard 中；任务范围由已有的 **Saved Filter/JQL** 决定，沿用 Jira 自身权限与共享规则。

### 1.2 最终用户故事

- **US-01** 作为 Jira 用户，我能从 Dashboard 的“添加 Gadget”搜索 `Filter Gantt` 并添加。
- **US-02** 我能从自己拥有或有权访问的 Saved Filter 中选择一个筛选器，图表只显示该 Filter 返回、且我有权查看的 Issue。
- **US-03** 我能在自己的 Dashboard 中创建多个 Gadget，各自选不同 Filter/日期字段，互不影响。
- **US-04** 在一个共享 Dashboard 中，我可以切换 **个人筛选器**，且我的选择不影响其他浏览者。
- **US-05** 我能按天/周/月缩放，看到任务标题、Issue Key、负责人、状态、开始日期、结束日期，并点击任务打开 Jira Issue。
- **US-06** 如果 Filter 被撤销共享、Issue 权限变化、任务未排期或者任务数量过多，界面会准确提示，不泄露任何其他人的数据。
- **US-07** Dashboard 作者能设置统一的默认配置，只有具备 Dashboard 编辑权限的人能修改共享配置。

### 1.3 功能范围

| 功能 | 优先级 | 验收口径 |
|---|---|---|
| P2 插件安装、卸载、启用、禁用 | P0 | Jira 10.3.18 的 Manage apps 成功识别 |
| 在 Gadget 目录注册、添加到 Dashboard | P0 | 搜索名称能找到、添加后能运行 |
| Favourite/My/Shared Filter 选择、搜索 | P0 | 只显示当前用户可访问的 Filter；可搜索 |
| Filter 结果检索（当前用户身份） | P0 | Jira 自身权限生效、支持分页 |
| 任务时间轴与缩放 | P0 | 天/周/月视图、今天标记、滚动 |
| 任务信息与状态颜色 | P0 | 标题/Key/负责人/状态/起止时间，跳转 Issue |
| 未排期/无效排期提示 | P0 | 不伪造日期；显示单独清单及数量 |
| 多 Gadget 实例互不干扰 | P0 | 同页多个实例正常渲染、销毁、刷新 |
| 个人 Dashboard 配置 | P0 | 保存/刷新/重开后保留 |
| 共享 Dashboard 的个人视图选择 | P0 | 每位查看者独立存储个人选择 |
| 只读、防止拖拽修改 Jira | P0 | UI 操作不修改 Issue |
| 父子任务层级（仅授权且已返回） | P1 | 可折叠，缺失父级不报错 |
| Blocks 等 Issue Links 依赖线 | P1 | 只绘制视图内、授权的有效关联 |
| 全屏、导出 PNG | P1 | 不依赖付费库或外部服务 |
| 自动刷新间隔 | P1 | 关/5/10/30 分钟，切后台暂停 |
| 拖拽更改起止日期、回写 Jira | P2 | 用户明确启用后，经独立安全评审 |
| 自动排期、关键路径、资源排程 | 不在本次范围 | Community 与 PRO 功能不同；不得假装免费版支持 |

### 1.4 非目标

- 不复制、替代 Advanced Roadmaps 的 Plan 权限模型或完整排程引擎。
- 不同步 Jira 数据到外部 Center Server、第三方数据库或第三方云服务。
- 第一版不自动修改 Jira Issue，不新建任务，不修改依赖关系。
- 不实现完整项目组合管理、敏捷 Sprint 计划和跨项目自动排程。

---

## 2. 技术选择及可靠性边界

| 层级 | 采用方案 | 原因 |
|---|---|---|
| 宿主 | Jira Software Data Center 10.3.18 | 用户提供的确切版本 |
| 扩展框架 | Atlassian P2 / OSGi | Jira Data Center 原生扩展模型 |
| Gadget 注册 | `dashboard-item`，`configurable="true"` | 官方支持配置和 Gadget 目录展示 |
| 视图模板 | Soy + Jira Dashboard Item AMD | 遵循 Jira Dashboard Item 生命周期 |
| 图表 | `dhtmlx-gantt` **v10+ Community (MIT)** | 支持时间轴、依赖、层级、多实例；请锁定并确认实际 npm 版本 |
| 前端 | TypeScript 或现代 JavaScript；构建输出 AMD | 能与 Jira 的资源加载机制集成 |
| DOM/资源 | Jira `web-resource` + scoped CSS | 与其他 Gadget 隔离；资源部署在本地 |
| Jira 查询 | 浏览器使用当前登录用户的 Jira 同源 REST | 最少的后端代码，同时继承 Jira 权限 |
| 个性化持久化 | Java REST + ActiveObjects (AO) | 同一个共享 Gadget 中为每个用户保存不同 Filter |
| 编译 | Java 17，Maven，Atlassian SDK/AMPS | 符合 Jira 10 / Platform 7 的 Java 基线 |
| 身份 | 当前 Jira 登录 Session | 不使用管理员级服务账户或 PAT |
| 测试 | JUnit + JS 单测 + 真实 Jira 冒烟验证 | 功能、安全、跨用户验证 |

**必须查验的兼容性**：

- Jira 10/Platform 7 将 Java 17 作为基线，迁移 Jakarta 依赖坐标，更新了部分公共包/REST API；不能复制旧项目的 `javax.*`、AMPS 版本或 OSGi 导入规则。
- DHTMLX v10+ **Community** 采用 MIT；v9 及以前免费的 legacy 构建仍受 GPLv2 约束。将库及 `LICENSE`/NOTICE 打包到 JAR；核对实际 lockfile。
- DHTMLX Community 支持多图表实例，但不支持 PRO 专有的资源管理、自动排程、关键路径等能力。本文不会要求 PRO 功能。
- Atlassian Dashboard Item 官方教程历史上只在 Jira 7.10 测试过；真实的 Jira 10.3.18 安装与运行验证不可省略。

---

## 3. 核心产品交互（UI 设计）

### 3.1 Dashboard 展示模式

```text
┌────────────────────── Filter Gantt Gadget ───────────────────────────┐
│ [筛选器：我负责的开发任务 ▾]  [日] [周●] [月]  [今天] [刷新] [⚙]  │
│ 32 个任务   已排期 27   未排期 5                                  │
├─────────────────────────┬────────────────────────────────────────────┤
│ Issue / 标题            │ 10/26    11/02    11/09     11/16       │
│ SLG-101 头顶UI          │ ██████████                                 │
│ SLG-124 联调            │        █████████████                       │
│ SLG-152 QA              │                    ██████████              │
├─────────────────────────┴────────────────────────────────────────────┤
│ 未排期 (5) | 展开查看没有合法起止日期的 Issue                         │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.2 编辑共享 Gadget 配置（Dashboard 编辑者）

- **配置模式**：
  - `SHARED_FIXED`：一个 Gadget 指定统一 Filter；其他用户观看同一个查询配置，但各自仍受 Jira Issue 权限限制。
  - `VIEWER_SELECTABLE`（**默认推荐**）：Gadget 设置一个可选的公共默认 Filter；每个查看者能从自己的可用 Saved Filter 中选择并持久化“我的视图”。
- 默认 Filter：可为空；为空时提示用户选择。
- 开始日期字段：从当前实例可见的 Date/DateTime 字段中选择，例如 `customfield_10100`。**不要假设 Jira 原生存在统一 Start Date 字段**。
- 结束日期字段：默认 `duedate`，也能选自定义日期字段。
- 任务数上限：默认 500，管理员可配置但产品硬上限 1000（按性能测试可再调整）。
- 初始时间刻度：`day`/`week`/`month`，默认 `week`。
- 图表高度：默认 480px，范围 300–900px。
- 可选：子任务折叠、依赖线、状态颜色、刷新间隔。
- 非法配置应显示保存前校验错误，而不是静默回退。

### 3.3 普通查看者可操作的个人视图

- 查看者无须 Dashboard 编辑权限，也能在 Gadget 内选择**自己有权限访问**的 Saved Filter（仅 `VIEWER_SELECTABLE` 模式）。
- 普通查看者的选择通过“个人偏好接口”存储，不调用 Dashboard Item 的 `savePreferences`，避免修改共享 Gadget。
- 查看者可以选择 `使用默认 Filter` 清除个人覆盖。
- 可以临时改变时间刻度，不必更改团队共享配置；是否跨浏览器保存见第 6 节。
- 其他用户**不能通过接口读取/修改此用户的个人 Filter 选择**。

**共享 Dashboard 的关键原则**：Gadget Preferences 是实例级、潜在共享的配置；“我的 Filter”是 `gadgetId + jiraUserKey` 级的私有配置。二者不能混在一个字段中。

---

## 4. 系统架构与数据流

```text
Jira Dashboard（同源页面，当前用户 Session）
  └─ dashboard-item: Filter Gantt Gadget
      ├─ Soy 空容器 + AMD 入口
      ├─ GadgetConfig（共享：默认 Filter / 字段映射 / 显示选项）
      ├─ PersonalView（当前用户：个人 Filter / 时间刻度）
      ├─ Jira REST API（浏览器直连，同源，当前用户身份）
      │   ├─ /rest/api/2/filter/favourite
      │   ├─ /rest/api/2/filter/search（若 10.3.18 支持，则用于搜索）
      │   ├─ /rest/api/2/filter/{id}
      │   ├─ /rest/api/2/field
      │   └─ /rest/api/2/search
      └─ GanttMapper → DHTMLX Gantt instance

Jira P2 REST（仅存个人偏好，无 Jira Issue 管理员级读取）
  └─ /rest/filter-gantt/1.0/personal/{gadgetId}
      ├─ 校验当前用户和 Gadget 可访问性
      ├─ 校验目标 Filter 对当前用户可见
      └─ ActiveObjects：每个 [gadgetId, userKey] 一条记录
```

### 4.1 为什么原生 Jira REST 足够完成只读图表？

- 浏览器和 Jira 在同一 Origin，使用 Jira 现有 Session 请求，避免跨域、API Token、凭据托管。
- Jira Search/Filter API 对 **当前用户**执行筛选器可见性、Browse Project 与 Issue Security 等权限规则。
- 首屏 Soy 只返回占位容器，**不在 Jira Dashboard 服务端渲染阶段执行 JQL**，避免拖慢整个仪表盘；图表数据由前端异步加载。
- Java 仅承担 Gadget 注册（如果需要）、个人配置持久化、额外服务端权限校验；不重复开发 Jira 检索引擎。

### 4.2 获取有效 Filter 的逻辑

```text
Gadget Config.defaultFilterId
           │
           ▼
Personal API: 查询当前用户对 gadgetId 的覆盖配置
           │
       ┌───┴─────────────────────────┐
       │ VIEWER_SELECTABLE           │ SHARED_FIXED
       ▼                             ▼
用户覆盖 Filter（若存在）             共享默认 Filter
       │                             │
       └────────────┬────────────────┘
                    ▼
  Jira 校验当前用户能访问 Filter
                    ▼
        POST /rest/api/2/search
            jql = "filter = <ID>"
                    ▼
    仅有权限的 Issues → Mapper → Gantt
```

**禁止**把 Saved Filter 的 JQL 在服务端用系统管理员身份执行。`currentUser()` 等动态 JQL 必须在**实际查看者**身份下求值。

---

## 5. Saved Filter 查询和权限设计

### 5.1 Filter 选择器

数据来源按用户视角组织为“收藏”、“我创建的”、“共享给我的”：

- 收藏：`GET {contextPath}/rest/api/2/filter/favourite`。
- 我的/共享：先验证 Jira **10.3.18** 对 `GET /rest/api/2/filter/search` 的返回模型和分页；如接口行为不同，则使用 Jira 10.3 公开 Java `SearchRequest` API 实现轻量只读代理。
- 对用户输入的搜索关键字做长度与字符约束（如 1–100）；搜索/滚动分页，不一次加载所有组织筛选器。
- 结果仅展示当前用户可访问的 Filter：名称、ID、作者、收藏标记。若缺少权限，不展示筛选器的 JQL 明文。
- 用户选择时通过原生 `GET /filter/{id}` 校验可见性，随后再执行 Search；**只校验 Filter 不代表能查看所有 Issue**。

**第一阶段兼容性探测**：Codex 在目标 Jira 10.3.18 测试账号下，验证以上 URL 与响应；保留记录，不能拿 Cloud REST v3 文档代替 DC 的证据。

### 5.2 权限矩阵

| 场景 | 行为 |
|---|---|
| 个人 Dashboard + 自己的私有 Filter | 正常可用，仅本人能打开对应 Dashboard/Filter |
| 共享 Dashboard + `SHARED_FIXED` + 所有查看者可访问的 Filter | 各用户按自己 Issue 权限看到不同可见集合 |
| 共享 Dashboard + `SHARED_FIXED` + 仅作者可访问的私有 Filter | 无权者收到“筛选器不可访问”，绝不能透出原作者数据 |
| 共享 Dashboard + `VIEWER_SELECTABLE` | 每人只能看到自己的个人选择与拥有权限的 Issue |
| Filter 后来变成私有或被删除 | 重新加载失败，清楚提示重新选择；不得显示缓存旧结果 |
| Issue 的 Issue Security / Browse 权限被撤销 | 重新查询后立即不再展示该 Issue |
| 非管理员尝试直接提交别人的个人偏好 URL | 拒绝访问，且不允许任意指定 `userKey` |
| 其他 Dashboard 的不可见 `gadgetId` | 个人偏好读/写接口均拒绝，避免越权访问和 ID 枚举 |
| 匿名用户 | MVP 不提供服务；返回合适的登录/许可错误 |

### 5.3 数据安全要求

- 所有 Ajax 必须同源且附带当前 Session，禁止服务端使用 Admin / PAT 代理查询用户任务。
- 自定义插件 REST 必须使用 Jira 10/Platform 7 的安全终端默认规则，并明确验证认证/许可/可访问性；禁止 `@UnrestrictedAccess`。
- 写个人偏好时执行 CSRF/XSRF 防护：遵照 Jira P2 REST 安全约定，验证 `X-Atlassian-Token` 等目标版本机制；**不能通过在 GET 接口写数据绕过校验**。
- 每个个人偏好请求从 Jira 会话解析用户，HTTP 请求体不允许传 `userKey` 当作授权身份。
- `filterId` 是整数/数字字符串，严格校验 ID 后才能拼接 JQL；禁止传任意字符串作为 JQL 模板。
- 不缓存含 Issue 名称、私有 Filter ID 的结果到共享 JVM 全局缓存/CDN；如做缓存，必须按用户和权限上下文隔离且短 TTL，权限变更后不能展示旧结果。MVP 默认**无服务端 Issue 缓存**。
- 前端使用 `textContent` 或受控 HTML 转义渲染 Issue Summary、负责人等；禁止 `innerHTML` 直接拼接 Jira 文本；防止 XSS。
- 不把 Session Cookie、CSRF Token、Filter 原始 JQL、Issue 私有字段写进日志。
- 页面链接仅使用 Jira 同源 `/browse/{KEY}` 构造并验证 Issue Key 格式；通过项目权限校验的 Issue 才显示。

---

## 6. 配置存储设计

### 6.1 Gadget 实例共享 Preferences（官方 Dashboard Item API）

用官方 `this.API.savePreferences(preferences)` 写入当前 Gadget 的实例配置。示例：

```json
{
  "isConfigured": "true",
  "schemaVersion": "1",
  "mode": "VIEWER_SELECTABLE",
  "defaultFilterId": "10001",
  "startDateFieldId": "customfield_10100",
  "endDateFieldId": "duedate",
  "initialScale": "week",
  "heightPx": "480",
  "maxIssues": "500",
  "showHierarchy": "true",
  "showDependencies": "false",
  "refreshMinutes": "0"
}
```

- 多个 Gadget 实例分别持久化自身配置。
- `isConfigured` 按 Jira Dashboard Item 官方约定处理。
- 校验最大/最小值，严格白名单枚举；保存失败应提示，不静默成功。
- Dashboard 没有编辑权限的用户只读共享 Preferences。
- **不得在共享 Preferences 中放当前查看者的 `personalFilterId`、userKey、临时私有信息。**

### 6.2 个人覆盖存储（ActiveObjects）

`PersonalGanttPreference` 逻辑表：

| 字段 | 类型 / 约束 | 用途 |
|---|---|---|
| `id` | Long / 主键 | AO 主键 |
| `gadgetId` | Long / 非空 | Dashboard Item 实例 ID |
| `userKey` | String / 非空 | Jira 稳定用户身份标识 |
| `selectedFilterId` | Long / 可空 | 个人选择；null 表示使用共享默认值 |
| `scale` | String enum / 可空 | 可选：个人时间粒度 |
| `updatedAt` | UTC Timestamp | 最近保存时间 |

建议加 `(gadgetId, userKey)` 组合唯一约束，若 AO 索引配置不支持所需保证，要在服务层处理并发幂等写入且加迁移测试。

**数据生命周期**：同一个用户在不同设备登录，个人视图一致。删除 Gadget 后可留下孤儿行，使用管理员安全清理任务或惰性清理；清理必须考虑 DC 多节点运行，不能依赖 JVM 本地单例。插件卸载行为与数据保留策略在 README 说明。

### 6.3 个人偏好 REST 合同（插件自定义）

基路径采用建议值：`{contextPath}/rest/filter-gantt/1.0`

```http
GET /rest/filter-gantt/1.0/personal/{gadgetId}
Accept: application/json
```

```json
{
  "gadgetId": 12345,
  "selectedFilterId": "10002",
  "scale": "month",
  "usesDefault": false
}
```

```http
PUT /rest/filter-gantt/1.0/personal/{gadgetId}
Content-Type: application/json
```

```json
{
  "selectedFilterId": "10002",
  "scale": "week"
}
```

```http
DELETE /rest/filter-gantt/1.0/personal/{gadgetId}
```

- DELETE = 恢复 Gadget 的默认过滤器（并恢复默认 scale）。
- 鉴权上下文只能从 Jira Session 取得，不接受客户端传 `userKey`。
- **写入前**校验 gadgetId 对当前用户可访问且是本插件实例；选定 Filter 必须对当前用户可见。
- 禁止用“仅 gadgetId 数值存在”视为已经授权。
- 返回 JSON 中不回显整个 JQL 或其他用户身份。
- 建议错误：401 未认证；403 无 Gadget/Filter 访问权；404 Gadget 不存在（必要时统一 404 防枚举）；400 配置无效；409 偏好版本冲突（若引入乐观锁）；500 内部错误。
- Java 10.3 具体服务名、AO 绑定、REST v2 注解以已安装 Jira 依赖/官方 API 编译验证为准。本文所示 REST URL 是**自定义接口合同**，不是声称 Jira 自带这些路由。

---

## 7. Jira Issue 检索与分页

### 7.1 读取日期字段的配置

```http
GET {contextPath}/rest/api/2/field
```

- 列出**当前用户可识别、适用**的日期类字段，按字段类型/自定义字段元数据过滤。
- 优先 `duedate` 作为结束日期；开始日期由用户选择，不能硬编码为 `customfield_10100`。
- 如果字段不在任务上下文、被删除、格式错误或用户无权看该字段，界面提示并让用户重新选择。

### 7.2 搜索 Issues（示例）

```http
POST {contextPath}/rest/api/2/search
Content-Type: application/json
Accept: application/json
```

```json
{
  "jql": "filter = 10001",
  "startAt": 0,
  "maxResults": 100,
  "fields": [
    "summary",
    "status",
    "assignee",
    "duedate",
    "parent",
    "issuelinks",
    "timeoriginalestimate",
    "timeestimate",
    "customfield_10100"
  ]
}
```

**注意**：`10001`、`customfield_10100` 都是示例，实际必须从 Gadget 配置取得。`fields` 只请求必要字段，其他扩展字段需经过字段权限和实际返回模型检查。

### 7.3 分页算法（务必防止数据漏查/无限加载）

```ts
async function fetchIssues(filterId: number, fields: string[], cap = 500) {
  const pageSize = 100;
  let startAt = 0;
  let collected: JiraIssue[] = [];
  let total = 0;

  while (collected.length < cap) {
    const size = Math.min(pageSize, cap - collected.length);
    const page = await jiraSearch({
      jql: `filter = ${filterId}`,
      fields,
      startAt,
      maxResults: size
    });
    total = page.total;
    if (!page.issues?.length) break;
    collected.push(...page.issues);
    startAt += page.issues.length;
    if (startAt >= total) break;
  }
  return { issues: collected, total, truncated: collected.length < total };
}
```

- `filterId` 必须预先转为正整数，绝不能直接拼接未验证的字符串。
- 实际 Jira 可能限制单页 `maxResults`；以响应和安装实例测试为准。
- 页面被销毁、切换 Filter 或用户退出时中止旧请求（`AbortController` 或等价机制），防止旧响应覆盖新选择。
- 默认限制 500、硬限制 1000；超过时显示 `仅显示前 500 / 总 1823 条`，不能假装全部显示。
- 搜索默认采用 Saved Filter 自身的 JQL 排序；如果产品需要其他排序，应在 UI 明确说明，不将 `ORDER BY` 硬拼到不安全的字符串里。

### 7.4 原生 API 和自定义 API 的职责

- **原生 Jira REST**：Filter、field metadata、Issue 查询、Issue 点击跳转。
- **本插件 REST**：个人视图偏好（如使用 AO）；不做代理转发全部 Jira Issue，避免再实现一次 Jira 权限系统。
- 如果因 Jira CSP/前端限制某端点确实不可用，可替换为插件内部 **以当前用户身份**调用公开 Jira `SearchService` 的只读 REST；须实现等价的权限和 JQL 校验测试。

---

## 8. 甘特图数据映射规则

### 8.1 Jira → 统一任务 DTO

```ts
type GanttIssueTask = {
  id: string;               // Jira issue.id （稳定、唯一）
  key: string;              // SLG-101
  text: string;             // summary
  startDate: string | null; // YYYY-MM-DD，本地日历日期
  endDate: string | null;   // YYYY-MM-DD，Jira 语义的【包含】结束日
  parentId: string | null;  // 仅当父 Issue 在当前可见数据中存在
  assignee: string | null;
  status: string;
  statusCategory: string;
  progress: number | null;  // 0..1，未知则 null
  href: string;             // Jira 同源 browse URL
};
```

### 8.2 日期映射和边界（非常重要）

- Jira `duedate` 是日历日期，通常理解为**包含当天**；DHTMLX Gantt 对日粒度任务的 `end_date` 通常是**不包含的次日 00:00**。
- 举例：Jira 开始 `2026-10-26`、结束 `2026-10-28`，Gantt 使用本地 `start_date = 2026-10-26 00:00`、`end_date = 2026-10-29 00:00`。UI 显示结束仍为 `10/28`。
- 必须使用日历加一天（`setDate(getDate() + 1)` 或纯日期库），**不得**简单做 UTC 毫秒加 `86400000` 后期待本地日期在夏令时切换仍正确。
- 不要让 JS `new Date('YYYY-MM-DD')` 的 UTC 解释造成跨时区偏一天；建议按年月日创建本地日期。
- `start == end` 的任务应该展示 1 天宽度，而不是消失。
- `end < start` 属于无效排期，进入异常清单，不隐式交换日期。
- DateTime 字段需要先按照 Jira 指定时区转换成**用户所见日历日期**，规则在配置界面标明；不要把毫秒时间直接混进日粒度柱状图。
- 默认 DHTMLX `duration_unit = 'day'`，`work_time = false`；第一版以自然日为单位，避免用户误以为自动排除周末。

### 8.3 未排期处理

| 数据情况 | 规则 |
|---|---|
| 两个日期有效 | 显示正常任务柱 |
| 只有开始日期 | 放入“未排期”清单，不自动补结束日 |
| 只有截止日期 | 放入“未排期”清单，不自动补开始日 |
| 两个日期都为空 | 放入“未排期”清单 |
| 日期格式非法/结束早于开始 | 放入“排期异常”清单，标注原因 |

Community 版不保证具备 PRO 的原生 `unscheduled` 功能，因此 MVP 不应以 `unscheduled: true` 作为必备显示方式。

### 8.4 层级及依赖线

- 父任务 ID 仅从本次搜索结果**已授权且存在的父 Issue** 中使用；不可自动额外拉取无权访问的父级。
- 父 Issue 未包含在结果内时，此任务显示为顶层节点；不得出现孤儿树节点崩溃。
- 依赖关系仅解析 `issuelinks` 中明确定义的 link type（默认只支持“blocks / is blocked by”），并分清方向。
- 两端 Issue 必须都属于当前有权限的返回集合，才生成连接线。
- 链接不影响排期，**不启用自动排程**。
- 如果某些父子关系形成异常环，先进行图检测并断开错误层级，记录无敏感信息的诊断。

### 8.5 进度和颜色

- 优先使用 Jira 的可用进度/时间估算字段：`originalEstimate > 0` 时，可计算 `clamp((originalEstimate-remainingEstimate)/originalEstimate, 0, 1)`；缺数据时 `progress = null`，不要假装 0%。
- 完成状态可在 UI 以状态色显示；是否推断 100% 需作为显式策略并标注。
- 任务颜色按 `status.statusCategory`（To Do / In Progress / Done）映射，不能只依赖中文/英文 status.name 文本。
- 对于 `progress = null`，柱体不渲染“0%”数字，只显示状态。

### 8.6 DHTMLX v10 多实例

```ts
// 示意，具体 import/build 形式以锁定版本为准
import { Gantt } from 'dhtmlx-gantt';

function mountGantt(container: HTMLElement, data: GanttData) {
  const gantt = Gantt.getGanttInstance();
  gantt.config.readonly = true;
  gantt.config.duration_unit = 'day';
  gantt.config.work_time = false;
  gantt.init(container);
  gantt.parse(data); // 需映射到官方 data / links 结构
  return () => gantt.destructor();
}
```

- 实际代码必须每个 Dashboard Item 使用自己的 `Gantt.getGanttInstance()`，而不是共用全局 `window.gantt`。
- Gadget 移除、Dashboard 跳转、DOM 卸载时 `destructor()`；前端保留 `AbortController` 与事件解绑清理。
- CSS 应限定在插件根容器；DHTMLX 内置全局样式必要时通过构建工具前缀化，测试不污染 Jira UI。
- `gantt.config.readonly = true` 与禁止双击弹出编辑/任务拖拽等需双重检查；**仅是前端防误操作，不是权限防线**。

---

## 9. 插件工程与模块设计

### 9.1 推荐目录

```text
filter-gantt-gadget/
├── pom.xml
├── README.md
├── LICENSE-THIRD-PARTY.md
├── docs/
│   ├── ARCHITECTURE.md
│   ├── INSTALL.md
│   ├── TEST_PLAN.md
│   ├── API.md
│   └── CHANGELOG.md
├── frontend/
│   ├── package.json
│   ├── package-lock.json
│   ├── rollup.config.mjs
│   ├── tsconfig.json
│   ├── src/
│   │   ├── dashboardItem.ts
│   │   ├── filterPicker.ts
│   │   ├── jiraClient.ts
│   │   ├── config.ts
│   │   ├── personalPreferenceClient.ts
│   │   ├── mapper.ts
│   │   ├── ganttView.ts
│   │   ├── dates.ts
│   │   ├── styles.css
│   │   └── types.ts
│   └── tests/
├── src/main/java/com/qixia/jira/filtergantt/
│   ├── rest/PersonalPreferenceResource.java
│   ├── service/GadgetAccessService.java
│   ├── service/FilterAccessService.java
│   ├── service/PersonalPreferenceService.java
│   └── ao/PersonalGanttPreferenceEntity.java
├── src/main/resources/
│   ├── atlassian-plugin.xml
│   ├── i18n/filter-gantt.properties
│   ├── soy/filter-gantt.soy
│   ├── images/gantt-thumb.png
│   └── js-css/                 # 前端编译产物由 Maven 复制
└── src/test/
    ├── java/
    └── resources/
```

### 9.2 `atlassian-plugin.xml` 结构参考

> 下列片段用于规定**应注册什么**，不是未经 Jira 10.3.18 实际构建验证就声称可直接粘贴运行的完整 descriptor；由 Codex 补齐 `web-resource` 中 Soy transformer、资源地址、REST/AO、i18n 和 OSGi 配置。

```xml
<atlassian-plugin key="${atlassian.plugin.key}"
                  name="Filter Gantt Gadget"
                  plugins-version="2">
    <plugin-info>
        <description>Gantt chart from accessible Jira saved filters</description>
        <version>${project.version}</version>
        <vendor name="Qixia Internal" />
    </plugin-info>

    <resource type="i18n" name="i18n" location="i18n/filter-gantt" />

    <web-resource key="filter-gantt-resources" name="Filter Gantt Resources">
        <dependency>com.atlassian.auiplugin:ajs</dependency>
        <!-- JS AMD、Soy 编译资源、CSS、图标：Codex 补齐并检验资源可访问 -->
        <context>filter-gantt</context>
    </web-resource>

    <dashboard-item key="filter-gantt-dashboard-item"
                    i18n-name-key="filtergantt.title"
                    configurable="true">
        <definition>
            <title key="filtergantt.title" />
            <categories><category>Chart</category></categories>
            <author><name>Qixia Internal</name></author>
        </definition>
        <description key="filtergantt.description" />
        <resource name="view" type="soy"
                  location=":filter-gantt-resources/FilterGantt.Templates.Root" />
        <amd-module>filter-gantt/dashboard-item</amd-module>
    </dashboard-item>

    <!-- 个人偏好功能必须另加 REST v2 + AO 模块及必要服务绑定 -->
</atlassian-plugin>
```

**必须严格参照**官方 Dashboard Item 模块文档验证 `definition`、`resource`、`amd-module`、`configurable` 的准确位置。最终 XML 必须能在 Jira 10.3.18 注册并出现在 Gadget 目录；不能只依赖静态 XML 校验。

### 9.3 Dashboard Item AMD 生命周期

官方接口（需在目标版本实测）：

```ts
interface DashboardItemApi {
  isEditable(): boolean;
  savePreferences(preferences: Record<string, string>): void;
  resize(): void;
  initRefresh(): void;
  showLoadingBar(): void;
  hideLoadingBar(): void;
  closeEdit(): void;
  getGadgetId(): number | string;
  setTitle(title: string): void;
  once(event: string, cb: () => void): void;
}

class FilterGanttDashboardItem {
  constructor(private readonly API: DashboardItemApi) {}
  render(context: HTMLElement, preferences: Record<string, string>) { /* ... */ }
  renderEdit(context: HTMLElement, preferences: Record<string, string>) { /* ... */ }
}
```

- `render(context, preferences)`：异步获取 Viewer Preference / Filter / Issues；显示加载状态；渲染唯一实例 Gantt；结束后 `resize()`。
- `renderEdit(context, preferences)`：只在 Dashboard 可编辑时展示共享配置表单；通过 `savePreferences` 保存。
- `getGadgetId()`：作为个人偏好数据库主键的一部分；验证真实返回值、生命周期与存储稳定性。
- `initRefresh()`、Dashboard 自带刷新和插件“刷新”按钮避免重复触发，无需额外全局定时器。
- 同一 Dashboard 的多个 Gadget，所有选择器/事件监听必须相对于该 `context` 查找，不能使用全局 `document.querySelector('.gantt')`。
- 按官方文档使用 Soy 仅渲染容器/加载骨架，**禁止同步在 Soy 阶段执行 Jira 搜索**。

### 9.4 前端构建（重要）

- 推荐 Rollup 生成 **AMD** 模块，入口名对齐 `filter-gantt/dashboard-item`。
- npm 依赖锁定 exact 版本；`npm ci` 可重复构建；只打包 v10+ Community，不能混入旧 GPL 包。
- Maven 的前端集成构建应有明确 `generate-resources`/`process-resources` 阶段，打包产物放到 JAR 内并由 `web-resource` 引用。
- **不得使用外部 CDN** 加载 JS/CSS/字体。企业内网场景离线可运行。
- 避免动态导入导致 AMD/RequireJS 与 chunk 名称错配；若分块，必须验证 Jira `web-resource` 实际加载顺序。
- Jira 自带 AUI 与本插件 CSS 做 namespace 隔离；检查 CSP 与资源 URL contextPath 兼容。

### 9.5 Maven 与 Java 版本

建议在 `pom.xml`：

- `jira.version=10.3.18`（以 Atlassian 仓库实际可获取的 Artifact 版本为准）。
- Java 编译 `release=17`。
- 使用与目标环境兼容的 `jira-maven-plugin`/AMPS、Atlassian REST v2、AO 与 OSGi 公共依赖；不得直接从历史项目粘贴版本号。
- Jira 提供的依赖一般标为 `provided`，避免在插件 JAR 中打包 Jira 内核 Jar 与冲突版本。
- CI 交付前运行 `mvn -B -DskipTests=false clean package`。
- 若因 Atlassian 仓库授权或制品下载失败，记录具体缺失的依赖和修复步骤，不要“仅生成文件即算成功”。

---

## 10. REST、权限、扩展 API 的工程实现细则

### 10.1 自定义 REST 的注册

- 新版 Jira 10 基于 Platform 7；优先采用其 REST v2 实现规范、对应的 `jakarta.ws.rs` 坐标与安全注解。
- 使用 `<rest ...>` 模块注册 `/rest/filter-gantt/1.0` 路径；类级或端点级限制为需要 Jira 许可的登录用户，并进行细粒度业务授权。
- 只读 GET 不产生任何个人偏好写入；PUT/DELETE 才变更 AO。
- 插件 REST 只处理个人偏好，不接受任意 SQL、不允许查询其他用户偏好。

### 10.2 Gadget 访问控制

个人偏好接口必须校验：

1. 当前 HTTP Session 有合法 Jira 用户，且满足许可访问条件。
2. `gadgetId` 对应真实存在的 Dashboard Item/Portlet 配置，且模块 key 属于**本插件**。
3. 当前用户可以浏览 Gadget 所在的 Dashboard（含共享规则）；如果 Gadget 是私有 Dashboard 的组件，其他人不能靠猜 ID 写入。
4. 操作的行始终限定 `jiraUserKey == currentUser.key`。
5. 个人 Filter 必须真实存在且对 `currentUser` 可见；使用 Jira 公开 Java API（如 SearchRequestManager 或其他 10.3 对应服务）执行权限检查，勿自行解析分享对象字符串模拟 Jira ACL。

**重要**：相关 Jira Java API 具体类/方法签名在 Jira 10.3.18 中必须通过 `javap` / IDEA 依赖浏览 / 官方 Java API 校对；本文没有凭空承诺某个 Java 方法签名一定存在。

### 10.3 HTTP 错误与前端反馈

| 错误 | UI 行为 |
|---|---|
| 401：会话失效 | 显示“请重新登录 Jira”，保留非敏感的共享配置 |
| 403：Filter 权限被撤销 | 提示“无权访问当前筛选器，请重新选择”，清空 Issue 数据 |
| 404：Filter/Gadget 被删除 | 标明资源不存在（不要泄漏其他用户名称） |
| 400：日期字段/配置无效 | 指向具体配置项并提供重新编辑入口 |
| 429/503/超时 | 指数退避/手动刷新，避免狂刷 Jira |
| 结果为空 | 显示“当前筛选器无可见任务”，不是报错 |
| 结果超过上限 | 明确标注“只显示前 N 条” |

在任何错误情况下，先清除旧图表数据，禁止因权限错误仍留存上次用户看到的 Issue 卡片。

---

## 11. 功能状态机和性能

### 11.1 前端状态

```text
UNCONFIGURED
  → CONFIGURING
  → LOADING_PREFERENCE
  → LOADING_FILTER
  → LOADING_ISSUES
  → MAPPING
  → RENDERED
     ├─ FILTER_CHANGED → LOADING_FILTER
     ├─ REFRESH → LOADING_ISSUES
     ├─ UNAUTHORIZED → ERROR_PERMISSION（先清空数据）
     ├─ INVALID_FIELD → ERROR_CONFIG（先清空数据）
     └─ DESTROY → CLEANUP（取消请求、解绑、destructor）
```

### 11.2 性能指标（目标，需实测并记录）

- 100 Issue、无依赖线、单 Gadget：在普通办公 PC 中基本流畅。
- 500 Issue、单 Gadget：有加载状态、滚动可用、不锁死页面；记录首屏渲染耗时。
- 同时 3–5 个 Gadget：资源和 DOM/实例互不冲突。
- 分页请求有并发限制（推荐串行或最多 2 个），不使 Jira 瞬时遭受大量 JQL 请求。
- 页面销毁取消网络请求和定时器；同一 Gadget 刷新不创建多个 Gantt 实例造成泄漏。
- 只读查询不持久化 Issue 数据到 AO。
- 在缓存敏感的数据前先通过权限审查；MVP 直接查询，不做共享服务端缓存。

### 11.3 Data Center 多节点

- AO 使用 Jira 插件官方持久化，不采用本机 SQLite、单节点文件或 JVM Map 作为唯一数据源。
- 不依赖粘性 Session 才能查询个人偏好；反向代理可将用户切到任意 Jira 节点。
- 初始化、升级迁移、卸载、字段新增必须在多节点与重复部署下幂等。
- 若未来实现用户缓存或定时任务，优先使用 Jira Data Center 可用的集群安全机制。

---

## 12. 第一版验收用例（可直接变成自动化测试）

| ID | 操作 / 前置条件 | 预期结果 |
|---|---|---|
| TC-01 | 管理员安装 JAR，打开 Manage Apps | 插件 Enabled，无 OSGi/REST 错误 |
| TC-02 | 普通用户 Dashboard → Add Gadget 搜索 Filter Gantt | 找到并成功添加 |
| TC-03 | Gadget 未配置 | 出现共享配置界面（可编辑者）或选择默认提示 |
| TC-04 | 选择自己的 Private Filter | 只显示当前用户有权访问的 Issue |
| TC-05 | A 与 B 打开同一个共享 Dashboard 的 VIEWER_SELECTABLE Gadget，选择不同 Filter | A/B 各自保持个人 Filter、刷新和跨设备登录后保持独立 |
| TC-06 | A 为共享 Gadget 选择私有 Filter，B 没有该 Filter 权限 | B 不可看到 Filter/Issue 的私密信息，能选择自己的 Filter |
| TC-07 | B 向 `/personal/{gadgetId}` 冒用 A 的信息或尝试访问 A 私有 Gadget | 请求被拒绝，无越权读写 |
| TC-08 | 任务日期 `2026-10-26` → `2026-10-26` | 仅出现一天宽度柱子 |
| TC-09 | 任务跨夏令时切换周 | 日期不漂移、不多一天/少一天 |
| TC-10 | 缺少开始/结束日期 | 在未排期清单，不臆造起止日期 |
| TC-11 | 结束日期小于开始日期 | 作为异常单独展示，不让 Gantt 报错 |
| TC-12 | 页面上添加 3 个不同 Filter Gadget | 状态、CSS、事件与数据完全独立 |
| TC-13 | 第一个 Gadget 配置保存并刷新 | 配置被保留，其他 Gadget 不受影响 |
| TC-14 | Filter 改为私有、被删或 Issue 安全级别变化 | 下次刷新移除无权数据；不展示旧缓存 |
| TC-15 | 结果超过 cap（如 1200 Issue） | 只绘制 cap 条，明确总数与截断告警 |
| TC-16 | 浏览器失去 Jira Session | 登录错误，不写 Jira Issue，不泄漏数据 |
| TC-17 | 用户尝试拖动柱、双击修改 | 第一版无法保存或误修改 Jira |
| TC-18 | 点击有权限的 SLG-101 | 在 Jira 同源 `/browse/SLG-101` 打开 Issue |
| TC-19 | Jira Context Path 为 `/jira` 和根路径 `/` | URL 均正确拼接，不依赖硬编码主机名 |
| TC-20 | 禁用/卸载插件 | Dashboard 不再出现可运行模块；Jira 其他功能正常 |
| TC-21 | 用户仅有查看共享 Dashboard 权限、无编辑权 | 能选个人 Filter，不可修改共享 Gadget Preferences |
| TC-22 | Linux/Windows 浏览器、中文与英文标题混合 | 标题、工具提示、字段、时间轴正确显示且不 XSS |

### 12.1 用于开发的最小测试数据

- 两个普通用户 `userA` / `userB`；一个 Dashboard 管理员 `admin`。
- 两个 Jira 项目和不同 Project Browse 权限。
- 三个 Saved Filter：A 私有、B 私有、双方共享。
- 10–20 条 Issue，包括日期相同、跨月、跨夏令时、仅截止日期、父子任务、blocks 链接、被安全级别保护的 Issue。
- 一份共享 Dashboard，至少两个同类 Gadget。
- 真实数据无需搬到外网，任何日志和截图须脱敏。

---

## 13. 开发计划（按 Codex 任务拆分）

### 里程碑 M0 — 工程骨架与 Jira 10.3 兼容性验证

- 建立 Maven P2 项目与前端工程。
- 锁定 Java 17、Jira 10.3.18、AMPS、REST v2、AO 和 DHTMLX Community 依赖；记录版本。
- 注册最简单 Dashboard Item，占位显示 `Hello Filter Gantt`，真实安装后在 Gadget 目录中可见。
- 检查插件启动日志没有 `ClassNotFoundException`、`NoClassDefFoundError`、`Package ... cannot be resolved`。
- **交付**：可安装的初版 JAR、编译日志、环境验证记录。

### 里程碑 M1 — Saved Filter 与只读 Issue 查询

- 实现 Filter 选择器、字段选择器、Gadget Preferences。
- 查询并分页获取 Jira Issues，支持缺少日期/空结果/权限错误。
- 实现 `JiraClient`、`FilterPicker`、Mapper 单测与 Mock REST 回归测试。
- **交付**：能在 Gadget 中选择过滤器并显示基础任务列表。

### 里程碑 M2 — 甘特图引擎

- 引入 DHTMLX Gantt v10+ Community、只读模式、天/周/月时间轴。
- 实现包含式 Jira End Date → 排除式 DHTMLX end_date 的转换。
- 任务 Key/标题/负责人/状态、点击跳转、未排期任务清单。
- 多 Gadget 多实例、局部 CSS、清理机制、权限失败清空数据。
- **交付**：核心 Filter Gantt 可用。

### 里程碑 M3 — 共享 Dashboard 的个人选择（核心业务功能）

- AO 表与数据迁移、个人偏好自定义 REST、严格访问控制。
- `SHARED_FIXED`、`VIEWER_SELECTABLE` 两种模式。
- A/B 多用户、不同浏览器、跨节点（条件允许）测试。
- **交付**：同一个共享 Dashboard 中每个人可选自己的 Filter，互不干扰。

### 里程碑 M4 — 安全、性能和交付

- 分页上限、大量数据降级、CSRF、XSS、IDOR、权限撤销测试。
- 补齐文档/许可证/测试报告与安装、升级、回滚流程。
- **交付**：正式版 JAR + 源码 + README + 测试记录 + Release Notes。

**开发优先级处理**：P0 功能全部完成后才考虑 P1；P2 修改 Jira Issue 必须另做授权和审计设计，不得在首次上线时隐式开启。

---

## 14. 部署安装与回滚

### 14.1 开发机基础步骤（示意）

```bash
# 需先安装 Java 17、Maven、Node.js LTS、Atlassian SDK/AMPS
npm --prefix frontend ci
npm --prefix frontend run build
mvn -B clean package
```

安装管理：

1. **测试实例**：Jira 管理员 → `Administration` → `Manage apps` → `Upload app`，选择编译得到的 JAR。
2. 打开 `Dashboards` → 选择/新建 Dashboard → `Add Gadget`。
3. 搜索 `Filter Gantt` → 添加 → 填写默认 Filter/字段映射 → 保存。
4. 用多位权限不同的员工账号验证个人视图与权限。
5. 确认无集群节点兼容、资源加载或性能问题后，按公司发布流程部署到生产。

**注意**：管理员可能禁用了上传自定义 App 的功能；这种情况应由 Jira 管理员按本地政策启用或使用受支持的企业插件部署流程。不能绕过管理权限直接向 Jira 安装目录塞入未经验证的 JAR。

### 14.2 发布和回滚

- 发布前保留旧版 JAR、`pom.xml` 和前端锁文件。
- 记录 plugin key、版本号、数据库迁移版本、Jira 10.3.18 测试结果。
- 回滚优先禁用新插件或恢复旧 JAR；个人 AO 数据需保持向后兼容。
- 严禁在回滚时自动丢弃个人偏好表；删除数据须经管理员明确批准。
- 安装包与源码内部版本控制，禁止把组织的 Jira 主机、Cookie、PAT、Issue 私有数据上传到公共仓库。

---

## 15. 交付物清单（Codex 必须逐项确认）

```text
[ ] 可编译的完整源码仓库
[ ] pom.xml / Java 17 / Jira 10.3.18 依赖版本记录
[ ] atlassian-plugin.xml（完整 web-resource / dashboard-item / REST / AO）
[ ] Soy 模板、AMD 入口、已打包的 DHTMLX Community v10+ 前端
[ ] Gadget 共享配置表单与校验
[ ] Saved Filter 列表、搜索与当前用户 Issue 查询
[ ] 日期字段映射、分页和截断提示
[ ] 只读 Gantt、日期换算、任务跳转、未排期列表
[ ] 共享 Dashboard 内的个人 Filter 选择及 AO 持久化
[ ] 真实 Jira 用户权限检查，不绕过 Jira ACL
[ ] 多实例资源与 DOM 隔离
[ ] 单元测试、模拟 Jira REST 测试、多用户权限集成测试
[ ] README.md / docs/INSTALL.md / docs/API.md / docs/TEST_PLAN.md
[ ] 第三方开源许可证与依赖清单
[ ] target/*.jar（真实可安装文件）
[ ] Jira 10.3.18 安装/测试记录；如未测试必须明确注明
[ ] 生产上线与回滚操作说明
```

### 15.1 最终交付报告模板

```md
# Filter Gantt Gadget — 交付报告
- 插件版本：
- Jira 测试版本（精确到 patch）：
- Java / Maven / AMPS / Node / DHTMLX 版本：
- JAR 路径及 SHA-256：
- 构建命令与结果：
- 单元测试通过数：
- 集成测试通过数：
- 10.3.18 安装测试：已验证 / 尚未验证（原因）：
- 已实现 P0 项目：
- 未完成项与影响：
- 已知风险：
- 部署步骤：
- 回滚步骤：
```

---

## 16. 官方文档和依赖依据

以下均为产品与开发文档；Codex 在开发时应优先参考，遇到签名、依赖或语义冲突以目标 Jira **10.3.18** 的公共 API 与实际验证为准。

1. Atlassian — Dashboard Item 模块（注册、配置、AMD 生命周期和 Gadget Preferences）：  
   https://developer.atlassian.com/server/jira/platform/dashboard-item-module/
2. Atlassian — Writing a Dashboard Item App（仅作为结构参考，官方示例历史测试版本较旧）：  
   https://developer.atlassian.com/server/jira/platform/writing-a-dashboard-item-app/
3. Atlassian — Building a Dashboard Item（资源隔离、异步加载、性能建议）：  
   https://developer.atlassian.com/server/jira/platform/building-a-dashboard-item/
4. Atlassian — Prepare your Data Center app for Platform 7（Jira 10 兼容、Java 17、Jakarta 依赖）：  
   https://developer.atlassian.com/platform/marketplace/dc-apps-platform-7/
5. Atlassian — Secure Endpoint Defaults（REST 端点默认授权与安全注解）：  
   https://developer.atlassian.com/platform/marketplace/dc-apps-platform-7-preparing-for-secure-endpoints/
6. Atlassian — Jira Data Center REST API 参考入口（进入 **Jira 10.3 LTS** 版本）：  
   https://developer.atlassian.com/server/jira/platform/rest/v10004/
7. Atlassian — Preparing for Jira Software 10.0：  
   https://developer.atlassian.com/server/jira/platform/preparing-for-jsw-10-jsm-6/
8. DHTMLX — Installation；v10 Community MIT / 旧版本 GPL：  
   https://docs.dhtmlx.com/gantt/guides/installation/
9. DHTMLX — Community / PRO 功能对比：  
   https://docs.dhtmlx.com/gantt/guides/editions-comparison/
10. DHTMLX — Multiple Gantt instances：  
    https://docs.dhtmlx.com/gantt/guides/multiple-gantts/
11. DHTMLX — Data Loading 与 Inclusive End Date：  
    https://docs.dhtmlx.com/gantt/guides/loading/
12. DHTMLX — GitHub 开源仓库：  
    https://github.com/DHTMLX/gantt

---

## 17. 本文中必须先验证的实现假设（不可当成既有事实）

1. **Jira 10.3.18 自带 Filter Search REST 是否支持所需分页/搜索参数**：以本机实际调用为准；否则回退到当前用户的公开 Jira Java API。
2. **Jira P2 Plugin / Dashboard Item 与 Java 17、AMPS、REST v2、AO 的精确版本组合**：先完成最小插件真实构建与安装验证。
3. **`getGadgetId()` 返回值对应 PortletConfiguration 的实际对象关系**：在开发机用两个 Dashboard、三个 Gadget 验证，并用官方公共 API 做授权检查。
4. **DHTMLX v10+ Community 的实际 npm 版本、打包模块入口、样式冲突与 readonly 事件表现**：以锁定版本的集成测试为准。
5. **Jira Field API 的日期类型标识与具体项目字段上下文**：通过真实用户的 `/field` 和 Issue 返回数据验证。
6. **Jira REST 2 的安全注解/XSRF 行为**：采用 10.3.18 依赖和官方说明完成实际正负测试。
7. **Gadget Preference 的保存与触发 render 的行为**：以 Dashboard Item 官方接口和 10.3.18 实测为准；不得靠写入其他 Gadget 的配置绕过 API。

> **验收最终标准**：不是“能画一个甘特图”，而是 **10.3.18 真正可安装、可以从 Dashboard 添加、可按个人有权访问的 Saved Filter 显示、多人共享安全且相互独立、可重复编译的 Jira Gadget JAR**。
