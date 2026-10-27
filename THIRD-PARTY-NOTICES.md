# 第三方依赖

本项目源码沿用仓库 Apache-2.0 许可证。

- **dhtmlx-gantt 10.0.3 Community**：MIT，Copyright (c) 2026 XB Software。精确版本与 integrity 锁定在 `frontend/package-lock.json`；构建脚本校验版本和 MIT 标记，将原始 `LICENSE.md` 打包到 JAR 的 `frontend/licenses/dhtmlx-gantt-MIT.txt`。未使用旧 GPL、Trial 或 PRO 构建。
- **Jira API 10.3.18 / Atlassian Platform APIs**：Atlassian 提供的宿主 API，全部 `provided`，不会打包 Jira 内核或库。使用受安装环境的 Jira/Atlassian 许可约束。
- **Java 构建工具**：Maven、AMPS、Spring Scanner、Maven Compiler/Surefire/Exec，Apache-2.0（仅构建）；JUnit 4.13.2，EPL-1.0（仅测试）；Mockito 4.11.0，MIT（仅测试）；Jersey Common，EPL-2.0/GPL-2.0 with Classpath Exception（仅测试）。
- **前端构建工具**：Rollup（MIT）、Rollup Node Resolve/CommonJS 插件（MIT）、PostCSS（MIT）、postcss-prefix-selector（MIT）；不进入运行时 JavaScript。
- **Playwright**：Apache-2.0，仅本地浏览器测试，不进入 JAR。测试调用本机浏览器，不重新分发浏览器。

运行时没有 CDN、遥测、导出服务器或外部服务。浏览器仅请求当前 Jira 同源 REST。
