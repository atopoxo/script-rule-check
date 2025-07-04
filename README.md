# Script Rule Check Extension

## 功能概述 (Features Overview)

### 脚本规则检查 (Script Rule Checking)
- 🧪 **多规则检查**：支持11种不同的脚本检查规则（Trap脚本、场景模块、玩家模块等）
- 🌳 **多种显示模式**：支持树形结构、平铺列表和规则结构三种结果展示方式
- ⚙️ **自定义配置**：允许用户选择要执行的特定规则组合
- 📊 **实时进度显示**：带有进度条和取消功能的检查过程
- 🔍 **结果导航**：可直接从结果跳转到问题代码位置

### AI辅助功能 (AI Assistance)
- 💬 **智能聊天**：集成大模型进行代码分析和技术问答
- 🧠 **上下文管理**：支持添加代码片段、文件和文件夹作为对话上下文
- 🔄 **流式响应**：实时显示AI生成内容，支持暂停和继续
- 🧪 **代码检查**：智能分析选中的代码片段并提出改进建议
- 📚 **会话管理**：支持创建、删除、重命名和切换多个对话

### 配置管理 (Configuration Management)
- 🛠️ **模型配置**：支持多种AI模型，可自定义模型参数
- 📂 **工作区设置**：配置产品库目录和检查规则
- 🌙 **主题适配**：自动适应VS Code的亮色/暗色主题

## 如何使用 (How to Use)

### 基本设置 (Basic Setup)
1. 安装插件后，通过命令面板执行 `Set Product Directory` 命令
2. 输入您的产品库根目录路径（绝对路径）
3. 保存配置后，插件将自动初始化

### 执行脚本检查 (Running Script Checks)
1. 在资源管理器中右键点击文件或文件夹
2. 选择以下任一选项：
   - `检查所有用例规则`：运行全部11种检查
   - `检查自定义用例规则`：仅运行选定的规则
   - `检查指定用例规则`：选择特定规则执行
3. 检查结果将显示在侧边栏的"Script Check Results"视图中

### 使用AI聊天功能 (Using AI Chat)
1. 打开侧边栏的"AI Chat"视图
2. 选择要使用的AI模型
3. 输入您的问题或请求
4. （可选）通过以下方式添加上下文：
   - 选中代码后点击"添加到上下文"
   - 使用"检查代码"分析选中代码
   - 添加文件或文件夹作为参考

### 快捷键 (Shortcuts)
- `Ctrl+Alt+R`：强制重启插件（Windows）
- `Cmd+Alt+R`：强制重启插件（Mac）

## 开发说明 (Development Notes)

### 技术栈 (Technology Stack)
- TypeScript
- VS Code Extension API
- SQLite（数据存储）
- Vue.js（Webview UI）
- Tree-sitter（代码解析）

### 构建命令 (Build Commands)
```bash
# 开发模式
npm run debug

# 生产构建
npm run vscode:prepublish

# 运行测试
npm run test
```

## 许可证 (License)

MIT License

Copyright (c) 2025 shaoyi

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

**GitHub Repository**: [https://github.com/atopoxo/script-rule-check](https://github.com/atopoxo/script-rule-check)