### 中文版 README.md

```markdown
# VSCode 脚本规则检查工具

![VSCode扩展](https://img.shields.io/badge/VSCode-Extension-green)
![Version](https://img.shields.io/badge/Version-0.0.3-blue)

一个基于自定义规则集的脚本检查工具，支持 Lua/Python 脚本的自动化检查，提供多模式结果展示和灵活配置。

## 功能特性

- **产品目录配置**  
  支持自定义产品根目录路径（需包含 `tools/CheckScripts` 子目录）
- **多规则检查**  
  支持全规则检查、自定义规则筛选、单个规则快速检查
- **智能结果展示**  
  提供三种展示模式：
  - 🌳 目录树结构（默认）
  - 📜 文件平铺列表
  - 🧩 按规则聚合
- **编码自动识别**  
  自动检测文件编码（支持 GBK/UTF-8 等）
- **可视化配置**  
  提供图形化配置界面，支持动态规则开关

## 安装方式

### 市场安装
1. 在 VSCode 扩展商店搜索 "script-rule-check"
2. 点击安装按钮

### 手动安装
```bash
git clone https://github.com/atopoxo/script-rule-check.git
cd script-rule-check
vsce package
code --install-extension script-rule-check-0.0.3.vsix
```

## 使用说明

### 基础配置
1. 点击侧边栏「脚本规则检查」图标
2. 在 Configuration 面板设置产品库目录（如 `z:/trunk`）

### 执行检查
| 操作方式                | 说明                         |
|-----------------------|----------------------------|
| 右键菜单 -> 检查所有用例规则 | 对选中文件/目录执行全规则检查      |
| 右键菜单 -> 检查自定义规则  | 仅执行配置中勾选的规则          |
| 右键菜单 -> 检查指定规则    | 从子菜单选择特定规则进行检查      |

### 结果查看
- 检查结果将显示在「Script Check Results」视图
- 通过顶部工具栏切换展示模式：
  ```plaintext
  🌳 目录树结构 | 📜 文件列表 | 🧩 规则聚合
  ```
- 双击结果项自动跳转到对应代码位置

## 高级配置
```json
{
  "script-rule-check.customCheckRules": ["rule1", "rule3"],  // 自定义勾选规则ID
  "script-rule-check.displayMode": "rule"  // 可选值：tree/flat/rule
}
```

## 命令列表
| 命令                          | 功能描述                     |
|------------------------------|----------------------------|
| `extension.checkAllRules`     | 执行全规则检查               |
| `extension.checkCustomRules`  | 执行自定义规则检查           |
| `extension.setProductDir`     | 设置产品库目录               |
| `extension.setDisplayMode`    | 切换结果展示模式             |

## 注意事项
1. 确保产品库路径包含有效的检查工具链：
   ```
   /tools/CheckScripts/
     ├── Case/          # 规则脚本
     ├── Log/           # 检查日志
     └── lua/5.1/lua.exe
   ```
2. 遇到文件编码问题时，工具会自动尝试 GBK/UTF-8 解码
3. 日志文件生成在 `tools/CheckScripts/CheckScripts/Log` 目录

## 版权声明
MIT License © 2025 [shaoyi](https://github.com/atopoxo)
```

---

### English Version README.md

```markdown
# VSCode Script Rule Checker

![VSCode Extension](https://img.shields.io/badge/VSCode-Extension-green)
![Version](https://img.shields.io/badge/Version-0.0.3-blue)

An intelligent script validation tool with customizable rule sets, supporting Lua/Python automation checks and multi-mode result visualization.

## Key Features

- **Product Directory Configuration**  
  Customizable root directory path (requires `tools/CheckScripts` subdirectory)
- **Multi-rule Validation**  
  Support full-rule checks, custom rule selection, and single-rule quick checks
- **Smart Result Visualization**  
  Three display modes:
  - 🌳 Directory Tree (default)
  - 📜 File List 
  - 🧩 Rule-oriented Grouping
- **Auto Encoding Detection**  
  Supports GBK/UTF-8 and other encodings
- **Visual Configuration**  
  Graphical interface with dynamic rule toggling

## Installation

### Marketplace
1. Search "script-rule-check" in VSCode Extensions
2. Click Install

### Manual Install
```bash
git clone https://github.com/atopoxo/script-rule-check.git
cd script-rule-check
vsce package
code --install-extension script-rule-check-0.0.3.vsix
```

## Usage Guide

### Basic Setup
1. Click the 「Script Rule Check」 sidebar icon
2. Set product directory in Configuration panel (e.g. `z:/trunk`)

### Execution Methods
| Operation                  | Description                  |
|---------------------------|------------------------------|
| Right-click -> Check All Rules | Full-rule check for selected files/dirs |
| Right-click -> Check Custom Rules | Execute selected rules only |
| Right-click -> Check Specific Rule | Choose from rule submenu |

### Result Inspection
- Results display in 「Script Check Results」 view
- Switch modes via top toolbar:
  ```plaintext
  🌳 Tree | 📜 Flat | 🧩 Rule
  ```
- Double-click items to navigate to code locations

## Advanced Configuration
```json
{
  "script-rule-check.customCheckRules": ["rule1", "rule3"],  // Custom rule IDs
  "script-rule-check.displayMode": "rule"  // Options: tree/flat/rule
}
```

## Command List
| Command                      | Description               |
|------------------------------|---------------------------|
| `extension.checkAllRules`     | Execute full-rule check   |
| `extension.checkCustomRules`  | Run custom rule checks    |
| `extension.setProductDir`     | Set product directory     |
| `extension.setDisplayMode`    | Switch display mode       |

## Notes
1. Ensure product directory contains valid toolchain:
   ```
   /tools/CheckScripts/
     ├── Case/          # Rule scripts
     ├── Log/           # Check logs
     └── lua/5.1/lua.exe
   ```
2. Auto encoding fallback to GBK/UTF-8 when detection fails
3. Log files generated in `tools/CheckScripts/CheckScripts/Log`

## License
MIT License © 2025 [shaoyi](https://github.com/atopoxo)
```