# 版本依据与兼容性核对

目标：Jira Software Data Center **10.3.18**。官方 Maven 仓库可解析 `jira-api`、`jira-core`、`jira-rest-plugin` 的该精确版本。核对日期：2026-10-26。

锁定版本：Java 编译 release 17、Maven 3.9.9、AMPS 9.5.2、Jira 10.3.18、Platform 7.2.40（Jira BOM 父版本）、Spring Scanner 5.1.0、ActiveObjects 6.1.5、Beehive 6.0.0、REST v2 API 8.2.2、DHTMLX Community 10.0.3 MIT。其余运行时 API 通过 Jira 10.3.18 的 jira-api-bom 管理，均 provided。

## 已实际核对

通过下载官方 JAR 并 `javap`，而不是套用旧博客：

- `PortletConfigurationManager.getByPortletId(Long)`；`PortletConfiguration.getDashboardPageId()`、`getUserPrefs()`、`getCompleteModuleKey()` 返回 `io.atlassian.fugue.Option<ModuleCompleteKey>`。
- `PortalPageService.getPortalPage(JiraServiceContext, Long)`：以当前用户的 JiraServiceContext 查询可访问 Dashboard。
- `SearchRequestService.getFilter(context,id)`、`validateForSearch(context,parameters)`、`search(context,parameters,pagePosition,pageWidth)`；pagePosition 是页号。
- `FavouritesService.isFavourite(user,entity)`；搜索上下文使用 `SharedEntitySearchContext.USE`。
- Jira 10.3.18 `com.atlassian.jira.rest.v2.search.FilterResource` 没有 Filter 搜索方法，采用文档许可的公开 Java API 兼容接口；原生 `/filter/{id}` 与 `/search` 仍由浏览器按登录会话调用。
- 目标 REST v2 仍使用 **javax.ws.rs**，Servlet 仍使用 **javax.servlet**。Jakarta **2.1.x/4.0.x 坐标**不等于 Jakarta EE 9 的包名迁移；不使用 `jakarta.ws.rs.*` 源码 import。
- npm registry/package-lock 与包内 LICENSE 确认 Community 10.0.3 为 MIT；实际 ESM 导出 `Gantt`，`Gantt.getGanttInstance()` 能在浏览器创建多实例。该 Community 包没有 `addMarker` 扩展，今天标记由公开 `posFromDate`、渲染事件和实例内 DOM 实现。
- 构建时去除锁定 ESM 包对 `window.gantt/window.Gantt` 的两个全局赋值，避免影响同页其他插件；不改变库的实例 API。自动化验证保留已有全局对象。

## 尚待真实 Jira 核验

UPM 安装/卸载、Dashboard Item/Soy/AMD 实际加载、Spring/OSGi 服务解析、REST v2 与企业 XSRF 策略、AO 在目标数据库的建表/唯一约束、getGadgetId 与 Portlet ID 的实际关系、跨节点并发、Jira 字段上下文、真实权限撤销以及生产规模性能。

**尚未通过真实 10.3.18 安装验证。** 以上编译/浏览器/mock 结果不能替代该步骤。

## 官方依据

1.2.1 另核对实际安装的 Jira 10.3.18 `portfolio-plugin-10.3.18.jar`：Target start/end 对应 `com.atlassian.jpo:jpo-custom-field-baseline-start` / `...-end`，继承 DateCFType；其校验使用 DATE_PICKER 与 UTC 日期格式器。因此 IssueService 参数沿用 Jira 本地日期选择器格式，不套用 Cloud REST 的 ISO 参数格式。此核对不依赖 Roadmaps 的内部 Java 包作为插件依赖，仅识别公开字段类型 key。

- [Dashboard Item 模块、AMD 生命周期和 Preferences API](https://developer.atlassian.com/server/jira/platform/dashboard-item-module/)
- [Platform 7 迁移入口](https://developer.atlassian.com/platform/marketplace/dc-apps-platform-7/)
- [Secure Endpoint Defaults](https://developer.atlassian.com/platform/marketplace/dc-apps-platform-7-preparing-for-secure-endpoints/)
- [Jira 10.3.18 API POM](https://packages.atlassian.com/maven-public/com/atlassian/jira/jira-api/10.3.18/jira-api-10.3.18.pom)
- [Jira 10.3.18 BOM](https://packages.atlassian.com/maven-public/com/atlassian/jira/jira-bom/10.3.18/jira-bom-10.3.18.pom)
- [DHTMLX 安装与 v10 MIT 说明](https://docs.dhtmlx.com/gantt/guides/installation/)
