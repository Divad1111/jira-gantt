# 管理员安装、升级和回滚

## 构建

需要 JDK 17、Maven 3.9.9+、Node.js 22/24 LTS 与 npm。设置 `JAVA_HOME` 后确认 `java -version`，不要只确认某个 IDE 的 JDK。

```powershell
mvn -B -DskipTests=false clean package
```

Maven 在 generate-resources 阶段执行 `npm ci`、前端单元测试、Rollup AMD 构建与 CSS 隔离，随后执行 Java 测试并生成 P2/OSGi JAR。需要访问 Maven Central、Atlassian Maven 仓库和 npm 官方仓库；所有资源打包后运行时无需访问公网。

产物：`target/filter-gantt-gadget-1.3.1.jar`。排期直接写回 Jira，支持 Target start / Target end 与普通日期字段。SCHEDULE 表仅保存排序和版本；WORK_CALENDAR 保存所有 Gadget 共用的全局工作日历；保留个人偏好。使用说明见 [本次改动说明](IN-PLACE-SYNC-1.3.1.md) 和 [Jira 同步规则](JIRA-SYNC-1.2.0.md)。

可执行 `./scripts/verify-package.ps1` 检查必需模块、OSGi 标识、Java 17 字节码、AMD 资源和许可证，并输出 SHA-256。

浏览器回归独立运行（需本机 Chrome；也可以设置 `PLAYWRIGHT_CHANNEL=msedge`）：

```powershell
npm --prefix frontend run test:browser
```

`-DskipFrontend=true` 仅用于已执行 `npm ci && npm test && npm run build` 的开发迭代，不用于首次干净发布构建。

## 测试实例安装

1. 在 Jira Software Data Center **10.3.18** 的测试实例备份配置和数据库；集群所有节点采用相同版本。
2. 管理员进入 Manage apps → Upload app，上传 JAR。若没有“上传应用”入口，Docker Compose 部署可先按下方步骤启用；若企业策略禁用上传，由管理员采用受支持的部署流程。
3. 确认插件 Enabled，检查每个节点的 OSGi、Spring Scanner、AO 和 REST 启动日志。
4. Dashboard → Add Gadget，搜索 **Filter Gantt Gadget** 并添加。若实例禁止匿名浏览，使用普通获许可用户验证。
5. 编辑共享配置：开始、结束必须选择两个不同的可写日期字段。例如自定义“计划开始日期”和原生“截止日期”。支持 Target start / Target end，自定义字段支持 Jira Date Picker / Date Time Picker，并须加入项目的编辑界面且适用于目标任务。创建日期和更新日期不可写，旧配置使用这些字段时会提示重新配置。DateTime 按 Jira 用户时区转换；结束日包含当天。
6. `VIEWER_SELECTABLE` 模式下，每位用户在“选择我的筛选器”设置个人覆盖。`使用默认 Filter` 删除个人覆盖与个人刻度；不修改共享偏好。
7. 按 `TEST_PLAN.md` 用 A/B 两个普通账号验证；特别检查 `getGadgetId()` 与 PortletConfiguration 的一致性。

仪表盘所有者可以排期，其他查看者只读。实际写回仍以当前用户调用 Jira 原生校验，需具备相应的编辑、分配、设置截止日期和评论权限，且字段未被工作流/界面配置禁用。没有管理员代写或跳过编辑界面检查。估时写入“原始预估时间”，剩余预估按原始预估减已耗工时计算且不小于零，已耗工时不变；启用 Jira 旧版工时模式时，已记录工时的任务修改原始预估会明确拒绝。自动排期先预览，再点“应用并同步到 Jira”；拖动、拉伸和双击保存会直接同步。

## 1.3.1 原位同步更新

更新 JAR 并刷新一次仪表盘即可。无需额外配置，无新增 AO 表。拖动、拉伸、自动排期应用或任务详情保存后，更新当前图表和任务，不自动重载 Gadget。同步提示显示在固定预留位置，保留人员/状态筛选、刻度、折叠和滚动位置。保存时暂时禁止重叠编辑及切换刻度，完成核实后恢复。

任务仍同步 Jira，并后台重新读取实际值和完整更新时间。部分保存失败或响应丢失时不重发写入；若最新数据无法核实，会保留当前视图并要求手动刷新后继续编辑。权限撤销仍清除图表。完整筛选结果通过“刷新”或定时刷新更新。详情见 [1.3.1 说明](IN-PLACE-SYNC-1.3.1.md)。

## 1.3.0 全局工作日历

甘特工具栏的“全局工作日历”是独立设置入口。所有 Dashboard、Gadget 和 Filter 使用同一份配置。Jira 管理员可以设置每周工作日、非工作日期和补班日期，其他用户仅查看。每日工时和每周工时单位继续读取 Jira 工时设置。

首次升级默认周一至周五工作，例外日期为空。旧 Gadget 内保存的日历保留在历史列，但不再生效；管理员应在全局入口统一录入。保存日历不会自动修改既有 Jira 任务日期，后续排期按新规则计算。已打开的旧预览若遇到日历更新，会要求刷新重新排期。

自动排期弹窗按人员姓名分组，同一人员内按拖动或上下箭头的顺序计算；跨人员拖动不会改变负责人。人员控件本身支持输入匹配和分页，无单独人员搜索框。

## Docker Compose：启用“上传应用”

Jira 10.3.18 使用的 UPM 默认可能关闭应用上传入口。管理员可以通过 Jira JVM 参数 `-Dupm.plugin.upload.enabled=true` 开启，见 [Atlassian 官方说明](https://support.atlassian.com/jira/kb/how-to-re-enable-plugin-upload-in-jira-data-center/)。

本机部署目录为 `D:\docker-jira`，配置文件为 `D:\docker-jira\docker-compose.yml`，Jira 服务名为 `jira`。修改前备份 Compose 文件。在 `services.jira.environment` 中配置以下变量：

```yaml
services:
  jira:
    environment:
      JVM_SUPPORT_RECOMMENDED_ARGS: "-Dupm.plugin.upload.enabled=true"
```

以上示例适用于原先没有该变量的情况。如果已经存在 `JVM_SUPPORT_RECOMMENDED_ARGS`，应保留全部已有参数，在原值末尾以空格分隔追加 `-Dupm.plugin.upload.enabled=true`，不要覆盖原值或重复添加。

保存后，在 PowerShell 中校验配置并应用：

```powershell
cd D:\docker-jira
docker compose config --quiet
# 仅在配置校验成功后执行：
docker compose up -d --no-deps jira
docker compose logs --tail 100 jira
```

环境变量变更需要由 Compose 重新创建 Jira 容器；`docker restart jira` 或 `docker compose restart jira` 会沿用原容器的环境变量，不能加载此次修改。上述 `up` 命令会使 Jira 短暂重启，`--no-deps` 避免启动或重建数据库等依赖服务。

此部署的 Jira home 和 PostgreSQL 数据均通过宿主机目录挂载，重新创建 Jira 容器会保留这些数据；保持现有 `volumes` 配置不变，无需执行 `docker compose down` 或删除数据目录。集群部署需要在所有 Jira 节点应用同一参数。

等待 Jira 启动完成后，以系统管理员身份重新打开“管理应用”，点击“上传应用 / Upload app”，选择 `target/filter-gantt-gadget-1.3.1.jar`。已安装旧版时，上传同 plugin key 的 1.3.1 作为更新，保留配置和 AO 数据。安装成功并启用后，再到仪表盘添加 **Filter Gantt Gadget**。若尚未出现入口，先确认容器已经按新配置重新创建、Jira 启动完成，且当前账号具有系统管理员权限。

如果此前已经配置好上传参数，此次仅更新插件 JAR，**无需再次修改 Compose 或重新创建容器**。上传后刷新仪表盘；旧配置若使用创建日期作为开始字段，须通过 Gadget 的“编辑”菜单改成可写日期字段。

## 数据与集群

插件 AO 保存用户稳定 key、Gadget ID、个人 Filter ID、刻度及更新时间，以及按 Gadget/Filter 关联的排序和版本，以及所有实例共用的全局工作日历。实体为 `GANTT_PREF`、`SCHEDULE`、`WORK_CALENDAR`，namespace 仍为 `filter-gantt`。任务估时、负责人、起止日期和评论写入 Jira，并从 Jira 重新读取；不在插件中保存任务副本。旧版 `PLAN`/`PLAN_TASK` 不再注册和使用，保留物理表供管理员备份恢复，升级不主动删库表。

偏好及排序使用身份唯一键与集群锁。同步前校验排期版本和 Jira 任务更新时间，应用时再次逐任务校验。批量更新可能部分成功：失败后停止后续任务，界面分别列出已保存、失败及未执行任务，并重新读取 Jira。AO 事务不能回滚 Jira 更新；任务顺序保存失败也会单独提示。原生 Jira 页面不参与插件锁，因此不保证跨系统编辑的整批原子性。请求超时结果未知时不自动重试，避免重复评论。

GET 不创建偏好。DELETE 只删除当前用户当前 Gadget 的个人偏好。删除 Gadget 后可能留下孤儿行；不自动清理，不运行单节点清理任务。卸载/禁用/回滚不主动删表；需要永久清除时由管理员在备份后按 AO 支持流程操作。

## 发布与回滚

真实安装、跨用户与全部节点验证通过后，按企业流程上线。保存原版 JAR、源码 tag、lockfile 和数据库备份。升级不得改变 plugin key、AO namespace 或身份哈希算法。

出现问题时先禁用插件；已有版本可通过 UPM 恢复旧 JAR。首次安装失败则卸载应用；保留 AO 数据以便排查和重装。回滚插件不会撤销已经同步的 Jira 任务修改；应根据任务历史按 Jira 正常流程恢复。保留个人偏好表，不直接改 Jira 安装目录或数据库中的 Issue 数据。
