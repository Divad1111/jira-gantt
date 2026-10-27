# 管理员安装、升级和回滚

## 构建

需要 JDK 17、Maven 3.9.9+、Node.js 22/24 LTS 与 npm。设置 `JAVA_HOME` 后确认 `java -version`，不要只确认某个 IDE 的 JDK。

```powershell
mvn -B -DskipTests=false clean package
```

Maven 在 generate-resources 阶段执行 `npm ci`、前端单元测试、Rollup AMD 构建与 CSS 隔离，随后执行 Java 测试并生成 P2/OSGi JAR。需要访问 Maven Central、Atlassian Maven 仓库和 npm 官方仓库；所有资源打包后运行时无需访问公网。

产物：`target/filter-gantt-gadget-1.0.3.jar`。1.0.3 包含此前启用修复，并修正保存配置后不加载的问题，筛选器改为搜索下拉框；修复记录见 `docs/FIX-1.0.3.md`。

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
5. 编辑共享配置：选择日期字段、模式、可选默认 Filter、上限与高度。没有统一的原生 Start Date 假设。DateTime 按 Jira 用户时区转换；结束日包含当天。
6. `VIEWER_SELECTABLE` 模式下，每位用户在“选择我的筛选器”设置个人覆盖。`使用默认 Filter` 删除个人覆盖与个人刻度；不修改共享偏好。
7. 按 `TEST_PLAN.md` 用 A/B 两个普通账号验证；特别检查 `getGadgetId()` 与 PortletConfiguration 的一致性。

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

等待 Jira 启动完成后，以系统管理员身份重新打开“管理应用”，点击“上传应用 / Upload app”，选择 `target/filter-gantt-gadget-1.0.3.jar`。已安装旧版时，上传同 plugin key 的 1.0.3 作为更新，保留配置和 AO 数据。安装成功并启用后，再到仪表盘添加 **Filter Gantt Gadget**。若尚未出现入口，先确认容器已经按新配置重新创建、Jira 启动完成，且当前账号具有系统管理员权限。

## 数据与集群

只保存用户稳定 key、Gadget ID、个人 Filter ID、刻度及更新时间。不保存 Issue/JQL/凭据，不修改 Jira Issue。数据库 AO 表由固定 namespace `filter-gantt` 管理，实体名 `GANTT_PREF`；身份哈希有唯一索引，同一条偏好写入还持有 Jira 集群锁。切换节点后从数据库读取，浏览器请求禁用缓存。

GET 不创建偏好。DELETE 只删除当前用户当前 Gadget 的行。删除 Gadget 后可能留下孤儿行；1.0.0 不自动清理，不运行单节点清理任务。卸载/禁用/回滚不主动删表；需要永久清除时由管理员在备份后按 AO 支持流程操作。

## 发布与回滚

真实安装、跨用户与全部节点验证通过后，按企业流程上线。保存原版 JAR、源码 tag、lockfile 和数据库备份。升级不得改变 plugin key、AO namespace 或身份哈希算法。

出现问题时先禁用插件；已有版本可通过 UPM 恢复旧 JAR。首次安装失败则卸载应用；保留 AO 数据以便排查和重装。回滚不丢弃个人偏好表，不直接改 Jira 安装目录或 Issue 数据。
