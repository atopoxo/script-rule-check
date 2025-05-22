### 中文版 README.md

# Script Rule Check - VSCode 扩展

![VSCode Extension](https://img.shields.io/badge/Visual%20Studio%20Code-v1.100+-blue?logo=visualstudiocode)

本扩展用于对 Lua/Python 脚本进行规则检查，支持自定义规则集，并在 VSCode 中可视化展示检查结果。

---

## 功能特性
- ✅ **多语言支持**: 支持 Lua/Python 脚本检查
- 🌳 **树形视图**: 以目录结构展示检查结果
- ⚙️ **自定义配置**: 可配置产品根目录路径
- 📜 **日志解析**: 自动解析规则检查工具生成的日志
- 📌 **快速跳转**: 点击结果直接跳转到对应代码位置
- 🛠️ **编码自动检测**: 支持 GBK/UTF-8 等编码格式

---

## 安装说明

### 方式一：VSIX 安装
1. 下载最新 `.vsix` 安装包
2. 在 VSCode 中执行 `Extensions: Install from VSIX`
3. 选择下载的安装包

### 方式二：源码安装
```bash
git clone https://github.com/atopoxo/script-rule-check.git
cd script-rule-check
npm install
npm run compile
# 按 F5 启动调试实例
```

---

## 使用方法

### 基本操作
1. 配置产品目录：
   - 打开 VSCode 设置 (Ctrl+,)
   - 搜索 `script-rule-check.productDir`
   - 填写正确的绝对路径（如 `z:/trunk`）

2. 执行检查：
   - 在资源管理器右键文件/文件夹 → `Check Script Rules`
   - 或通过命令面板 (Ctrl+Shift+P) 执行 `Check Script Rules`

3. 查看结果：
   - 左侧面板打开 `Script Check Results` 视图
   - 展开树形节点查看详细错误信息
   - 点击具体错误跳转到对应代码行

### 界面说明
![界面示意图](https://via.placeholder.com/800x400?text=TreeView+Demo)

---

## 配置说明
| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `script-rule-check.productDir` | string | `z:/trunk` | 产品根目录路径（需包含 tools/CheckScripts 目录） |

---

## 注意事项
1. 确保配置的路径存在以下结构：
   ```
   <productDir>
   └── tools
       └── CheckScripts
           ├── Case
           ├── Log
           └── lua
   ```
2. 需要安装 Python/Lua 运行时环境
3. 建议使用管理员权限运行 VSCode（Windows 系统）

---

## 开发说明
```bash
npm install         # 安装依赖
npm run compile     # 编译 TypeScript
npm run watch       # 实时编译
```

---

## 许可证
MIT License © 2025 shaoyi

---

### English Version README.md

# Script Rule Check - VSCode Extension

![VSCode Extension](https://img.shields.io/badge/Visual%20Studio%20Code-v1.100+-blue?logo=visualstudiocode)

A VSCode extension for static code analysis of Lua/Python scripts using custom rules, featuring visualized results in tree view.

---

## Features
- ✅ **Multi-language Support**: Lua/Python script checking
- 🌳 **Tree View**: Hierarchical display of results
- ⚙️ **Custom Configuration**: Configurable product root directory
- 📜 **Log Parsing**: Auto-parse rule check logs
- 📌 **Quick Navigation**: Direct code jumping from results
- 🛠️ **Encoding Detection**: Support GBK/UTF-8 encodings

---

## Installation

### Method 1: VSIX Install
1. Download latest `.vsix` package
2. Execute `Extensions: Install from VSIX` in VSCode
3. Select the downloaded package

### Method 2: Source Install
```bash
git clone https://github.com/atopoxo/script-rule-check.git
cd script-rule-check
npm install
npm run compile
# Press F5 to launch debug instance
```

---

## Usage

### Basic Workflow
1. Configure product directory:
   - Open VSCode Settings (Ctrl+,)
   - Search for `script-rule-check.productDir`
   - Set correct absolute path (e.g. `z:/trunk`)

2. Run check:
   - Right-click file/folder in Explorer → `Check Script Rules`
   - Or via Command Palette (Ctrl+Shift+P): `Check Script Rules`

3. View results:
   - Open `Script Check Results` view in sidebar
   - Expand tree nodes to see details
   - Click errors to navigate to code

### UI Overview
![UI Demo](https://via.placeholder.com/800x400?text=TreeView+Demo)

---

## Configuration
| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `script-rule-check.productDir` | string | `z:/trunk` | Product root directory (must contain tools/CheckScripts) |

---

## Notes
1. Ensure directory structure:
   ```
   <productDir>
   └── tools
       └── CheckScripts
           ├── Case
           ├── Log
           └── lua
   ```
2. Requires Python/Lua runtime
3. Recommend running VSCode as admin (Windows)

---

## Development
```bash
npm install         # Install dependencies
npm run compile     # Compile TypeScript
npm run watch       # Watch mode
```

---

## License
MIT License © 2025 shaoyi

--- 

Let me know if you need any adjustments to the content!