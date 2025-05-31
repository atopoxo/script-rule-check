# Webview 调试指南

本文档提供了在 VSCode 扩展中调试 Webview 前端代码的详细步骤，解决无法关联到前端源代码的问题。

## 问题描述

在 VSCode 扩展中使用 Webview 开发时，通常会遇到以下问题：
- 使用开发者工具调试 Webview 时，无法关联到前端源代码
- 断点不生效，无法查看变量值
- 控制台输出的错误无法追踪到源文件位置

## 解决方案

我们通过以下几个关键步骤解决这个问题：

1. 启用 Vite 的源码映射（Source Maps）
2. 配置正确的端口映射
3. 设置适当的调试配置
4. 使用开发模式加载源代码

## 调试步骤

### 1. 启动调试

有两种方式启动调试：

#### 方式一：使用复合调试配置（推荐）

1. 在 VSCode 中按下 `F5` 或点击调试面板中的 `Full Debug (Extension + Webview)`
2. 这将同时启动扩展和 Webview 调试器

#### 方式二：分步启动

1. 在终端中运行：`npm run debug-all`（或在 webview-ui 目录中运行 `npm run dev:sourcemap`）
2. 在 VSCode 中按下 `F5` 启动扩展
3. 打开 Webview
4. 在 VSCode 命令面板中运行 `Developer: Open Webview Developer Tools` 或使用扩展命令 `extension.openWebviewDevTools`
5. 在 Webview 开发者工具中，点击 Sources 面板，查看是否能看到源代码

### 2. 验证源码映射是否工作

1. 在 Webview 开发者工具中，按 `Ctrl+P`（Mac 上是 `Cmd+P`）
2. 输入源文件名（如 `App.vue` 或 `ChatView.vue`）
3. 如果源码映射正常工作，应该能看到并打开相应的源文件
4. 在源文件中设置断点，刷新 Webview 测试断点是否生效

## 开发模式与生产模式切换

- 开发模式：使用 Vite 开发服务器，支持热更新和更好的调试体验
  - 环境变量 `NODE_ENV` 设置为 `development`
  - Webview 加载的是 Vite 开发服务器上的源代码

- 生产模式：使用构建后的静态文件
  - 环境变量 `NODE_ENV` 设置为 `production`
  - Webview 加载的是构建后的静态文件

## 常见问题排查

1. **无法看到源代码**
   - 检查 Vite 配置中的 `sourcemap` 选项是否设置为 `true`
   - 确认 `launch.json` 中的 `sourceMapPathOverrides` 配置正确

2. **断点不生效**
   - 确保使用的是开发模式
   - 检查 Webview 开发者工具中的 Sources 面板是否能看到源文件
   - 尝试重新加载 Webview

3. **端口映射问题**
   - 确认 `ChatViewProvider` 中的 `portMapping` 配置正确
   - 默认 Vite 开发服务器端口是 5173，确保映射到了正确的调试端口 9222

## 技术细节

### 关键配置文件

1. **vite.config.ts**
   - 启用源码映射：`sourcemap: true`

2. **launch.json**
   - Webview 调试配置：使用 Chrome 调试器附加到 Webview
   - 源码映射路径覆盖：处理各种源码映射路径格式

3. **chat_view.ts**
   - 端口映射：将 Webview 端口映射到调试端口
   - 开发模式检测：根据环境变量决定加载方式

4. **tasks.json**
   - 定义构建和开发任务
   - 复合任务用于同时启动扩展和 Webview 开发服务器
