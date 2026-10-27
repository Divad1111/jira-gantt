# 1.0.2 条件类加载失败修复

2026-10-27 直接读取本机 `D:\docker-jira\jira-home\log\atlassian-jira.log`. 最新相关异常时间为 02:32:17 UTC, 即北京时间 10:32:17:

```text
There was an error loading the descriptor 'filter-gantt-dashboard-item'
of plugin 'com.qixia.jira.filter-gantt-gadget'. Disabling.
Caused by: java.lang.ClassNotFoundException:
com.atlassian.jira.plugin.webfragment.conditions.IsAnonymousUserCondition
not found by com.qixia.jira.filter-gantt-gadget [243]
```

这是 1.0.1 更新后的新异常. Spring XML 阶段不再报原命名空间错误, 但 Dashboard 描述符仍反射引用了宿主内部条件类. 该类不在已使用的 Jira 10.3.18 公开 API JAR 中, 且目标插件类加载器无法加载它. 新增包导入不能保证内部实现兼容, 因此改为插件自身实现登录条件, 使用公开 Condition 和 JiraAuthenticationContext API.

保留已登录且启用的用户可见, 匿名和停用用户不可见. REST 登录和权限检查保持不变. 新依赖按目标平台 BOM 解析为 webfragment-api 7.2.1, scope 为 provided, 不嵌入宿主库.

## 更新及验证

在管理应用页面上传 `../target/filter-gantt-gadget-1.0.2.jar` 更新已有应用. 无需重建容器. 确认版本及启用状态, 随后验证 Gadget 目录和 Dashboard 添加. 如仍有错误, 以此次操作的新时间读取完整异常链. **尚未在真实 Jira 上确认本版本启用成功.**

本次前端未变, 未重跑前端测试. 后端及打包验证结果见下方验证记录.

## 本地验证记录

- Maven 离线 package 成功, 36 项后端测试通过, 0 失败, 0 错误, 0 跳过. [构建日志](validation/build-1.0.2.txt).
- 包检查通过, 9 个 Java 17 class, 16 个必需条目. 条件类随包交付, manifest 包含公开 Condition API 导入. [检查结果](validation/package-1.0.2.json).
- 同一检查拒绝 1.0.1, 错误为 `Dashboard condition must be packaged by this plugin`.
- 文件大小: 903006 bytes.
- SHA-256: `66C8F7785C188E09A7380FAE7CD2F906B82FC7EC4BCA426E32DDF9BD56770902`.

## QA 说明

产生原因: Dashboard 显示条件通过描述符反射引用宿主内部类. 编译阶段未检查该引用, 目标 Jira 无法加载条件类, 因而禁用模块.

解决方案:
1. 改由插件自带条件判断登录状态, 使用公开接口.
2. 增加匿名, 停用及正常用户分支测试.
3. 增加描述符条件类加载和安装包类文件检查.

测试要点:
1. 更新后显示 1.0.2 且应用可启用, 日志不再出现条件类找不到的异常. 待真实环境复测.
2. 正常登录用户可添加 Gadget, 匿名和停用用户不可见.
3. 回归 Filter 权限, 日期映射, 图表显示及个人偏好保存.
4. 旧包的外部条件引用必须被包检查拒绝, 新包必须包含自身条件及公开接口导入.

修改清单: Dashboard 显示条件, 插件描述符及依赖, 后端回归测试, 安装包检查, 版本及安装说明.

成因标注:

Bug根因：SDK

引入方式：历史bug[优化开发完就存在]

## 可复制 Jira 备注

草稿, 提交前需程序人工复核. 未写入 Jira.

```text
产生原因:
Dashboard 显示条件通过描述符反射引用宿主内部类. 编译阶段未检查该引用, 目标 Jira 无法加载条件类, 因而禁用模块.

解决方案:
1. 改由插件自带条件判断登录状态, 使用公开接口.
2. 增加匿名, 停用及正常用户分支测试.
3. 增加描述符条件类加载和安装包类文件检查.

测试要点:
1. 更新后显示 1.0.2 且应用可启用, 日志不再出现条件类找不到的异常. 待真实环境复测.
2. 正常登录用户可添加 Gadget, 匿名和停用用户不可见.
3. 回归 Filter 权限, 日期映射, 图表显示及个人偏好保存.
4. 旧包的外部条件引用必须被包检查拒绝, 新包必须包含自身条件及公开接口导入.

修改清单:
Dashboard 显示条件, 插件描述符及依赖, 后端回归测试, 安装包检查, 版本及安装说明.

成因标注:
Bug根因：SDK
引入方式：历史bug[优化开发完就存在]
```
