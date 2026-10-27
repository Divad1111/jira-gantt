# Filter Gantt Gadget

面向 Jira Software Data Center **10.3.18** 的 P2/OSGi 插件。可从 Dashboard Gadget 目录添加，按当前用户有权限访问的 Saved Filter 绘制只读甘特图。

支持日/周/月刻度、今天标记、Issue 详情与同源跳转、未排期/异常清单、日期字段映射、最多 1000 条分页读取、多个 Gadget 实例。共享 Dashboard 支持每位查看者独立保存个人 Filter 和刻度，跨浏览器保留；个人选择不写入共享 Gadget Preferences。

默认模式 `VIEWER_SELECTABLE`；也支持作者指定默认 Filter 的 `SHARED_FIXED`。浏览器以当前 Jira Session 查询 Issue，插件只持久化个人偏好。没有管理员代理、外部服务、CDN 或 Issue 写回。

**当前版本 1.0.3：修复保存后误判为未配置，并提供可搜索的单个筛选器下拉框。** 详细依据见 [修复记录](docs/FIX-1.0.3.md)。真实 Jira 更新后仍待复测。

构建需要 JDK 17、Maven 3.9.9+、Node.js 22/24 LTS：

```powershell
mvn -B -DskipTests=false clean package
```

Maven 会执行 `npm ci`、前端单测、AMD/CSS 构建和 Java 单测。产物是 `target/filter-gantt-gadget-1.0.3.jar`。前端依赖通过 lockfile 固定，DHTMLX Community **10.0.3 / MIT** 及原始许可证随 JAR 分发。

```powershell
npm --prefix frontend run test:browser
```

浏览器回归使用本机 Chrome 和模拟 Jira REST，包含多实例、多用户、XSS、权限撤销与只读检查。

- [安装、升级与回滚](docs/INSTALL.md)
- [REST、权限与 XSRF 合同](docs/API.md)
- [测试计划与真实 Jira 验收](docs/TEST_PLAN.md)
- [版本依据与兼容性核对](docs/COMPATIBILITY.md)
- [第三方许可证](THIRD-PARTY-NOTICES.md)
- [原始设计文档](doc/Jira_10.3.18_Filter_Gantt_Gadget_开发设计文档.md)

源码目录：`src/main/java` 后端/AO/REST，`src/main/resources` 插件描述/Soy/Spring，`frontend/src` AMD 前端，`src/test` 与 `frontend/test` 自动化测试。

1.0.0 包含 P0 及可选父子层级、Blocks 依赖与后台暂停刷新。未实现 PNG 导出/全屏、自动排期、关键路径、拖拽回写。
