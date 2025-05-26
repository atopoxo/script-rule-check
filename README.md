### 中文版 README

# VSCode 脚本规则检查扩展

![VSCode版本支持](https://img.shields.io/badge/VSCode-1.95%2B-blue)  
一个用于自动化检查脚本文件（Lua/Python）规范性的VSCode扩展，支持树形/平面双模式展示检查结果。

## 功能特性
- ✅ 多规则批量检查（支持.lua/.py规则文件）
- 🌳 树形层级结构/平面列表双模式展示
- 📂 支持文件和目录级的批量检查
- 🔍 自动检测文件编码（GBK/UTF-8等）
- 📌 支持问题定位跳转（精确到行号）
- ⚙️ 可视化配置产品库目录

## 安装
1. 从VSCode Marketplace搜索安装 "script-rule-check"
2. 或手动安装.vsix包：
   ```bash
   code --install-extension script-rule-check-0.0.3.vsix
   ```

## 使用方法

### 基本流程
1. **配置产品库路径**  
   通过侧边栏「脚本规则检查」面板的"设置产品库目录"命令
   > 默认路径：`z:/trunk`

2. **启动检查**  
   - 资源管理器右键文件/目录 → 选择"▶ Run Script Rule Check"
   - 或通过命令面板(Ctrl+Shift+P)搜索执行命令

3. **查看结果**  
   检查结果将展示在侧边栏：
   - 🗂 树形模式：保持源码目录结构
   - 📃 平面模式：按文件路径排序

### 界面操作
| 功能 | 操作位置 | 图标/说明 |
|------|----------|-----------|
| 切换显示模式 | 结果面板标题栏 | 🌳/📃 图标切换 |
| 问题定位 | 点击检查结果条目 | 自动跳转到对应行 |
| 重新检查 | 右键菜单/命令面板 | 刷新图标 |

---

## 配置说明
| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `script-rule-check.productDir` | string | `z:/trunk` | 产品根目录路径（需包含 tools/CheckScripts 目录） |

---

## 技术依赖
- Node.js模块：`iconv-lite`, `chardet`
- 运行时环境：需配置Lua 5.1解释器

## 注意事项
1. 确保产品库路径包含有效的检查工具链：
   ```
   /tools/CheckScripts/
     ├── Case/          # 规则脚本
     ├── Log/           # 检查日志
     └── lua/5.1/lua.exe
   ```
2. 支持的被检文件类型：`.lua`

---

### English Version README

# VSCode Script Rule Check Extension

![VSCode Version](https://img.shields.io/badge/VSCode-1.95%2B-blue)  
A VSCode extension for automated script validation (Lua/Python), featuring dual display modes for inspection results.

## Features
- ✅ Bulk checking with multiple rules (.lua/.py rules)
- 🌳 Tree-structured / Flat-list dual display modes
- 📂 Batch check files and directories
- 🔍 Auto-detect file encoding (GBK/UTF-8 etc.)
- 📌 Precise issue navigation (line-level)
- ⚙️ Visual product directory configuration

## Installation
1. Search "script-rule-check" in VSCode Marketplace
2. Or manual install from .vsix:
   ```bash
   code --install-extension script-rule-check-0.0.3.vsix
   ```

## Usage

### Workflow
1. **Set Product Directory**  
   Use "Set Product Directory" command in sidebar panel
   > Default: `z:/trunk`

2. **Start Check**  
   - Right-click in Explorer → "▶ Run Script Rule Check"
   - Or via Command Palette (Ctrl+Shift+P)

3. **View Results**  
   Results in sidebar:
   - 🗂 Tree Mode: Preserve source structure
   - 📃 Flat Mode: Sorted by file path

### UI Operations
| Feature | Location | Indicator |
|---------|----------|-----------|
| Toggle View | Results panel title | 🌳/📃 icons |
| Issue Navigation | Click result item | Auto-jump to line |
| Re-check | Context menu/Palette | Refresh icon |

---

## Configuration
| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `script-rule-check.productDir` | string | `z:/trunk` | Product root directory (must contain tools/CheckScripts) |

---

## Dependencies
- Node modules: `iconv-lite`, `chardet`
- Runtime: Requires Lua 5.1 interpreter

## Requirements
1. Ensure product directory contains valid toolchain:
   ```
   /tools/CheckScripts/
     ├── Case/          # Rule scripts
     ├── Log/           # Check logs
     └── lua/5.1/lua.exe
   ```
2. Supported file types: `.lua`