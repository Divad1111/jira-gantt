# 1.0.1 启用失败修复记录

> 后续真实日志发现 Dashboard 条件类加载失败, 1.0.1 仍未完成启用验收. 请使用 [1.0.2 修复包](FIX-1.0.2.md). 本文保留前一次修复证据.

日期: 2026-10-27. 目标环境: Jira Software Data Center 10.3.18.

用户日志显示, 1.0.0 在创建插件 Spring 容器时失败:

```text
Unable to locate Spring NamespaceHandler for XML schema namespace
[http://www.atlassian.com/schema/atlassian-scanner]
Offending resource: META-INF/spring/plugin-context.xml
```

首版 Spring XML 使用了旧的无版本命名空间, 与项目使用的 Spring Scanner 5.1.0 不匹配. 1.0.1 将命名空间改为 `http://www.atlassian.com/schema/atlassian-scanner/2`, 同步修正 schemaLocation. 保留现有扫描和依赖注入方式.

## 安装包和验证

- 安装包: `../target/filter-gantt-gadget-1.0.1.jar`.
- 文件大小: 902098 bytes.
- SHA-256: `6136E69645DF17324CA64DDD592159C9D7542F1EB407715D0A5DC6C7982FE00A`.
- 离线 Maven package 成功, 后端 34 项测试全部通过, 包含新增命名空间和 schema 注册检查. [构建日志](validation/build-1.0.1.txt).
- 新 JAR 包检查通过, 检查 16 个必需条目及 8 个 Java 17 class. [包检查结果](validation/package-1.0.1.json).
- 相同检查脚本检查 1.0.0 JAR 时, 按预期拒绝其旧命名空间.
- 前端代码未变, 此次未重跑前端测试. 首版 15 项前端单测和 12 项浏览器模拟测试的历史结果见 [交付记录](DELIVERY.md).
- **真实 Jira 重新启用和功能验收尚待执行. 本地验证不代表目标实例启用已成功.**

## 更新步骤

1. 在 Jira 的管理应用页面上传 `filter-gantt-gadget-1.0.1.jar`, 更新已有应用. 插件 key 不变, 无需删除已有插件数据.
2. 确认应用版本为 1.0.1 且状态为已启用. 更新此插件无需修改 Docker 参数或重新创建容器.
3. 如仍失败, 重新点击启用并查看该时刻的日志. 优先保留插件 key 附近异常及完整 `Caused by` 链, 避免仅截取顶部提示.
4. 启用成功后, 在 Dashboard 添加 Filter Gantt Gadget, 验证 Filter 选择, 日期字段映射, 图表显示, 日/周/月切换及刷新后的个人选择保存.

PowerShell 跟踪日志:

```powershell
Get-Content "D:\docker-jira\jira-home\log\atlassian-jira.log" -Tail 150 -Wait
```

完整安装流程及 Docker 上传开关见 [安装文档](INSTALL.md).

## QA 说明

产生原因: 首版接入 Spring Scanner 时沿用了旧命名空间. 上传后初始化应用容器无法找到对应处理器, 导致启用失败.

解决方案:
1. 修正扫描配置的命名空间及对应 schema 地址.
2. 增加回归测试和安装包检查, 在交付前拦截同类配置错误.

测试要点:
1. 上传更新后显示版本 1.0.1, 应用可启用, 日志不再出现原 NamespaceHandler 异常. 此项待真实环境复测.
2. 验证 Gadget 可添加, Filter 有权限和无权限分支符合预期.
3. 验证日期映射, 图表刻度切换及刷新后的个人偏好恢复.
4. 本地自动化 34 项通过, 新包检查通过, 旧包被检查拒绝.

修改清单: 应用初始化配置, 插件版本, 配置回归测试, 安装包检查, 安装及修复文档.

成因标注:

Bug根因：SDK

引入方式：历史bug[优化开发完就存在]

## 可复制 Jira 备注

以下为草稿, 提交前由程序人工复核. 尚未写入 Jira.

```text
产生原因:
首版接入 Spring Scanner 时沿用了旧命名空间. 上传后初始化应用容器无法找到对应处理器, 导致启用失败.

解决方案:
1. 修正扫描配置的命名空间及对应 schema 地址.
2. 增加回归测试和安装包检查, 在交付前拦截同类配置错误.

测试要点:
1. 上传更新后显示版本 1.0.1, 应用可启用, 日志不再出现原 NamespaceHandler 异常. 待真实环境复测.
2. 验证 Gadget 可添加, Filter 有权限和无权限分支符合预期.
3. 验证日期映射, 图表刻度切换及刷新后的个人偏好恢复.
4. 本地自动化 34 项通过, 新包检查通过, 旧包被检查拒绝.

修改清单:
应用初始化配置, 插件版本, 配置回归测试, 安装包检查, 安装及修复文档.

成因标注:
Bug根因：SDK
引入方式：历史bug[优化开发完就存在]
```
