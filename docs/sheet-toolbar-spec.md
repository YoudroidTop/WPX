# Web Excel 多标签工具栏技术规格说明书 (Sheet Ribbon Specification)

## 1. 概述与背景

为全面对齐 WPS 与桌面级专业电子表格的交互体验，Web 端电子表格已由原有的多行散落工具栏重构成工业级 **Ribbon 多标签页工具栏体系**。
本规范定义了「开始」、「插入」、「数据」、「公式」、「视图」五大功能 Tab 及其二级子功能、数据协议契约，并为 iOS / iPadOS、HarmonyOS、Android 及 Desktop 原生端提供对齐实现指南。

---

## 2. 标签页与二级功能矩阵

### 2.1 【开始】Tab (`home`)
专注剪贴板、字符排版、对齐方式、数字格式、快速分析与单元格结构。

| 模块 | 功能项 | 动作与接口定义 | Web 状态 | 客户端实现建议 |
| :--- | :--- | :--- | :--- | :--- |
| **剪贴板与历史** | 撤销 (Undo) | `onUndo()`，快捷键 `⌘Z` / `Ctrl+Z` | 已实装 | 绑定系统快捷键或顶栏动作 |
| | 重做 (Redo) | `onRedo()`，快捷键 `⌘⇧Z` / `Ctrl+Y` | 已实装 | 绑定系统快捷键或顶栏动作 |
| | 格式刷 (Format Painter) | 暂存源单元格 `SheetCellStyle`，点击目标应用 | 已实装 (UI交互) | 原生剪贴板/状态暂存 |
| | 清空选区 (Clear Content) | `clearSelection(cells, selection)`，快捷键 `Delete` | 已实装 | 原生选区清空 |
| **字体与排版** | 字体下拉 (`SheetFontDropdown`) | 即时搜索框 + 最近使用 + 中英文字体预览列表 | 已实装 (下拉浮层) | 原生字体选择器 / 弹出列表 |
| | 字号下拉与步进 | 9~72 字号选择 + `A⁺` / `A⁻` 步长增减 | 已实装 | 原生字号步进控件 |
| | 粗体 (Bold) | `onStyleChange({ bold: !style.bold })` | 已实装 | 原生富文本/Cell 属性修改 |
| | 斜体 (Italic) | `onStyleChange({ italic: !style.italic })` | 已实装 | 原生富文本/Cell 属性修改 |
| | 下划线 (Underline) | `onStyleChange({ underline: !style.underline })` | 已实装 | 原生富文本/Cell 属性修改 |
| | 边框下拉 (`SheetBorderDropdown`) | 9 种框线网格预设（无/全/外/粗/双底/上下左右）+ 线条颜色 + 一键美化 | 已实装 (下拉浮层) | 原生边框网格渲染与边框选择器 |
| | 文字颜色 (`SheetColorPickerDropdown`) | 自动 + 10×6 主题渐变色矩阵 + 10 标准色 + 已用颜色 + 自定义拾色器 | 已实装 (下拉浮层) | 原生颜色选择器矩阵 |
| | 背景填充 (`SheetColorPickerDropdown`) | 无填充 + 10×6 主题渐变色矩阵 + 10 标准色 + 已用颜色 + 自定义拾色器 | 已实装 (下拉浮层) | 原生颜色选择器矩阵 |
| **对齐方式** | 水平对齐 | `onStyleChange({ align: 'left' \| 'center' \| 'right' })` | 已实装 | 原生对齐方式映射 |
| **数字格式** | 格式类型 | `general` / `number` / `currency` / `percent` | 已实装 | 共享 `shared/sheet-format.ts` |
| | 货币快捷键 | `onStyleChange({ numberFormat: 'currency' })` | 已实装 | 一键设置货币格式 (¥) |
| | 百分比快捷键 | `onStyleChange({ numberFormat: 'percent' })` | 已实装 | 一键设置百分比格式 (%) |
| **快捷分析与排序** | 自动求和 ($\Sigma$) | 插入 `=SUM(范围)`，支持 AVERAGE/COUNT/MAX/MIN | 已实装 | 插入公式模板并激活编辑 |
| | 升序排序 (A→Z) | `sortSheetSelection(cells, selection, 'asc')` | 已实装 | 共享 `shared/sheet-sort.ts` |
| | 降序排序 (Z→A) | `sortSheetSelection(cells, selection, 'desc')` | 已实装 | 共享 `shared/sheet-sort.ts` |
| **行列与查找** | 插入/删除行与列 | `changeSheetStructure(sheet, axis, index, count, op)` | 已实装 | 共享 `shared/sheet-structure.ts` |
| | 查找与替换 | 弹窗搜索/替换单元格文字，支持导航与批量替换 | 已实装 | 原生查找替换悬浮面板 |

---

### 2.2 【插入】Tab (`insert`)
专注非文字元素、结构扩张与可视化组件。

| 模块 | 功能项 | 动作与接口定义 | Web 状态 | 客户端实现建议 |
| :--- | :--- | :--- | :--- | :--- |
| **透视表** | 数据透视表 (Pivot) | 基于当前表格数据区域创建动态多维交叉透视报表 | 已实装 (交互弹窗) | 聚合引擎计算与副表生成 |
| **行与列** | 行列下拉选择器 | 在上方插入行、在左侧插入列、删除选中行、删除选中列 | 已实装 (下拉列表) | 原生结构变更交互 |
| **交互控件** | 复选框 (Checkbox) | 单元格插入可交互勾选标记 `[ ]` | 已实装 | 原生 Checkbox 渲染与点击事件 |
| | 下拉列表 (Dropdown) | 单元格配置候选值列表及数据有效性 | 已实装 (交互弹窗) | 原生 Picker / 下拉列表弹层 |
| **媒体与富文本** | 图片插入 (Image) | 单元格嵌入网络图片 URL 或本地图片 | 已实装 (交互弹窗) | 调用系统相册选择器上传/引用 |
| | 超链接 (Hyperlink) | 插入 URL 链接并在点击时调起外部跳转 | 已实装 (交互弹窗) | 原生打开系统浏览器 |
| | 文本框 (TextBox) | 插入多行说明文本框 | 已实装 (交互弹窗) | 原生浮动文本框 / 扩展备注 |
| | 水印 (Watermark) | 绝密、机密、草稿、仅供参考或自定义水印文字 | 已实装 (交互弹窗) | 背景水印层绘制 |
| | 二维码 (QRCode) | 输入网址或编号快速生成二维码嵌入单元格 | 已实装 (交互弹窗) | 原生二维码生成与渲染 |
| **符号与批注** | 特殊符号 (`symbol`) | 货币符号 (¥ $ € £)、数学符号 (± × ÷ ≈ ≠ ≤ ≥ √ ∑ π)、特殊记号 | 已实装 (网格选择弹窗) | 原生符号选择面板 |
| | 批注 (Comment) | 为当前单元格添加详细批注说明 | 已实装 (交互弹窗) | 原生浮动批注气泡 |
| **可视化图表** | 柱状图/折线图/饼图 | 根据选区数据生成轻量图表预览 | 已实装 (交互弹窗) | 原生 Chart 组件渲染 |
| **工作区容量** | 追加 50 行 / 5 列 | 动态扩展行数列数至 `MAX_ROWS` / `MAX_COLUMNS` | 已实装 | 原生工作表尺寸扩展 |

---

### 2.3 【数据】Tab (`data`)
专注数据组织、清洗、验证与自动计算。

| 模块 | 功能项 | 动作与接口定义 | Web 状态 | 客户端实现建议 |
| :--- | :--- | :--- | :--- | :--- |
| **数据导入** | 导入数据 (CSV/文本) | 粘贴或导入逗号/制表符分隔的 CSV 文本，自动按行列填充 | 已实装 (交互弹窗) | 共享 `shared/sheet-paste.ts` |
| **排序与筛选** | 升序与降序 | 选区多行按基准列自然排序，数值/文本/空值兜底 | 已实装 | 共享 `shared/sheet-sort.ts` |
| | 自动筛选 (AutoFilter) | 列头增加筛选漏斗浮标，支持值筛选 | 已实装 (交互弹窗) | 原生筛选下拉菜单 |
| **数据清洗** | 文本转数值 | 批量修复文本型数字，转换为标准数值（去除无法求和的问题） | 已实装 | 遍历选区去除单引号并强制转为数字 |
| | 数据有效性 | 单元格输入规则（数值范围、文本长度、下拉菜单） | 已实装 (交互弹窗) | 拦截输入并校验 |
| | 重复项处理 | 选区重复数据高亮标记与一键去重 | 已实装 (交互弹窗) | 扫描哈希去重 |
| | 文本分列 | 根据逗号、空格或分号拆分单列数据至相邻列 | 已实装 (交互弹窗) | 字符串分割并写入相邻列 |
| | 向下/向右填充 | 选区首行/首列相对引用复制，快捷键 `⌘D` / `⌘R` | 已实装 | 共享 `shared/sheet-fill.ts` |
| **尺寸微调** | 自定义行高与列宽 | 选中区域精确指定像素尺寸（24~300px / 48~600px） | 已实装 | 原生表格行列尺寸适配 |
| **工作区容量** | 追加 50 行 / 5 列 | 动态扩展行数列数至 `MAX_ROWS` / `MAX_COLUMNS` | 已实装 | 原生工作表尺寸扩展 |

---

### 2.4 【公式】Tab (`formula`)
专注函数库导航、分类浏览与计算引擎调度。

| 模块 | 功能项 | 动作与接口定义 | Web 状态 | 客户端实现建议 |
| :--- | :--- | :--- | :--- | :--- |
| **常用函数** | SUM / AVERAGE / COUNT / MAX / MIN / IF / VLOOKUP | 点击插入标准函数签名，并自动带入选区范围 | 已实装 (下拉选择) | 自动填充公式并调起软键盘/公式栏 |
| **分类函数库** | 财务函数 | PMT (每期付款), FV (终值), PV (现值), NPV (净现值), IRR (内收益率) | 已实装 (下拉选择) | 共享 `shared/formulas.ts` 引擎 |
| | 逻辑函数 | IF, AND, OR, NOT, IFERROR | 已实装 (下拉选择) | 共享 `shared/formulas.ts` 引擎 |
| | 文本函数 | CONCATENATE, LEFT, RIGHT, MID, TRIM, UPPER, LOWER, LEN | 已实装 (下拉选择) | 共享 `shared/formulas.ts` 引擎 |
| | 日期与时间 | TODAY, NOW, YEAR, MONTH, DAY, DATE | 已实装 (下拉选择) | 共享 `shared/formulas.ts` 引擎 |
| | 查找与引用 | VLOOKUP (垂直匹配), INDEX (行列取值), MATCH (相对位置) | 已实装 (下拉选择) | 共享 `shared/formulas.ts` 引擎 |
| | 数学与三角 | SUM, ROUND, ROUNDUP, ROUNDDOWN, ABS, INT, MOD, POWER | 已实装 (下拉选择) | 共享 `shared/formulas.ts` 引擎 |
| | 统计与信息 | AVERAGE, COUNT, COUNTA, COUNTIF, MAX, MIN, MEDIAN, ISNUMBER, ISTEXT | 已实装 (下拉选择) | 共享 `shared/formulas.ts` 引擎 |
| **计算状态** | 重新计算 | 强制重算当前工作表所有公式并刷新视图 | 已实装 | 纯函数计算器缓存刷新与版本递增 |

---

### 2.5 【视图】Tab (`view`)
专注视觉模式切换、辅助线标、冻结窗格与视口缩放。

| 模块 | 功能项 | 动作与接口定义 | Web 状态 | 客户端实现建议 |
| :--- | :--- | :--- | :--- | :--- |
| **阅读辅助** | 护眼模式 (Eye Care) | 一键切换柔和浅米绿护眼底色 (`#f4f8f0`) | 已实装 | 切换表格主题/调色板 |
| | 高亮十字行列 (Crosshairs) | 当前选中单元格所在的整行与整列柔和高亮辅助定位 | 已实装 | 原生 Cell 背景绘制判断 |
| **冻结窗格** | 冻结首行 / 首列 | 表头固定悬浮滚动，保持数据上下文可见 | 已实装 (下拉选择) | 共享 `shared/sheet-view.ts` |
| | 冻结至当前单元格 | 以选中单元格左上角为锚点多行多列同时冻结 | 已实装 (下拉选择) | 原生粘性布局 (Sticky Header) |
| | 取消冻结 | 恢复全自由滚动 | 已实装 (下拉选择) | 重置 frozenRows / frozenColumns |
| **界面元素** | 显示/隐藏网格线 | 切换单元格边框线渲染（`showGridlines`） | 已实装 (复选框) | 原生画笔开关 Grid lines |
| | 显示/隐藏行号列标 | 切换表头字母与左侧序号栏（`showHeadings`） | 已实装 (复选框) | 原生 Header 显示控制 |
| | 隔行标记 (Zebra Stripe) | 偶数行轻微灰/淡绿交替变色，提升多列表格可读性 | 已实装 (复选框) | 偶数行条件样式 |
| | 隐藏零值 (`hideZeros`) | 是否在单元格中隐藏数值 0 | 已实装 (复选框) | 条件格式过滤渲染 |
| **视口控制** | 缩放比例 (Zoom) | 50%、75%、90%、100%、125%、150%、200% 视口控制 | 已实装 (下拉选择) | 缩放绘制画布 |
| | 全屏显示 | 调用浏览器/系统全屏 API 隐藏工具栏与边框 | 已实装 | 沉浸式全屏视图 |

---

## 3. 下拉浮层设计体系 (Dropdown Systems)

### 3.1 调色板体系 (`SheetColorPickerDropdown`)
- **主题色矩阵 (10 列 × 6 行)**：
  - 第 1 行：10 种经典主色（白、黑、浅茶灰、深蓝、天蓝、深红、青绿、紫、浅蓝、橙黄）。
  - 第 2~4 行：80%、60%、40% 变浅阶梯。
  - 第 5~6 行：25%、50% 加深阶梯。
- **标准色栏 (10 种高饱和度颜色)**：深红、亮红、橙色、黄色、嫩绿、翠绿、浅蓝、标准蓝、深蓝、紫蓝。
- **动态已用色 (Used Colors)**：自动实时收集当前文档所有单元格已使用的色值，点击快速复用。
- **自定义色值选择器**：集成原生十六进制拾色器，支持任意颜色扩展。

### 3.2 边框体系 (`SheetBorderDropdown`)
- **9 种边框预设**：无框线、所有框线、外侧框线、粗外侧框线、双底边框、下框线、上框线、左框线、右框线。
- **线条颜色预设**：默认灰、绿色、蓝色、红色、橙色、黑色等。
- **一键美化表格**：自动应用专业表头深色底、斑马交替行与浅灰分割线。

### 3.3 字体体系 (`SheetFontDropdown`)
- **即时搜索**：支持拼音与中文即时模糊过滤。
- **最近使用字体**：记录用户最近点击的字体家族。
- **真实字体预览**：每个选项均以该字体的 CSS `font-family` 渲染预览文本。

---

## 4. 跨端客户端迁移与实现指南

### 4.1 跨平台共享内核 (`shared/`)
为确保 iOS / Android / HarmonyOS / Desktop 与 Web 端行为完全一致，所有业务与数据逻辑均必须复用或严格对齐 `shared/` 下的统一实现：
1. **公式与依赖计算**：[`shared/formulas.ts`](file:///Users/liang/Documents/AI_CODE/WPX/shared/formulas.ts)
2. **选区算法与矩形运算**：[`shared/sheet-selection.ts`](file:///Users/liang/Documents/AI_CODE/WPX/shared/sheet-selection.ts)
3. **范围填充与相对引用偏移**：[`shared/sheet-fill.ts`](file:///Users/liang/Documents/AI_CODE/WPX/shared/sheet-fill.ts)
4. **范围排序与多行联动**：[`shared/sheet-sort.ts`](file:///Users/liang/Documents/AI_CODE/WPX/shared/sheet-sort.ts)
5. **冻结窗格偏移与坐标**：[`shared/sheet-view.ts`](file:///Users/liang/Documents/AI_CODE/WPX/shared/sheet-view.ts)
6. **行列结构变更与公式平移**：[`shared/sheet-structure.ts`](file:///Users/liang/Documents/AI_CODE/WPX/shared/sheet-structure.ts)
7. **单元格格式与显示文本生成**：[`shared/sheet-format.ts`](file:///Users/liang/Documents/AI_CODE/WPX/shared/sheet-format.ts)
8. **粘贴解析与矩形校验**：[`shared/sheet-paste.ts`](file:///Users/liang/Documents/AI_CODE/WPX/shared/sheet-paste.ts)

### 4.2 布局形态适配准则
- **桌面端 / iPad / 平板横屏**：
  - 采用本规范的 **标准 Ribbon 顶部横向选项卡面板**，展开二级功能组，支持快捷键直达。
- **手机端（窄屏竖屏）**：
  - 顶部仅保留轻量 Tab 切换胶囊或常用快捷按钮；
  - 二级菜单收拢为 **底部弹出抽屉 (Bottom ActionSheet / Drawer)**，按「格式」、「插入」、「数据」、「公式」、「视图」分别展开垂直列表，保证单手触控操作面积 $\ge 44\times 44$ pt。

### 4.3 样式兼容性铁律
- **严禁使用 `Color.withValues(alpha: ...)`**：OpenHarmony 及旧版本 Flutter 运行时均不支持，必须统一使用 `Color.withOpacity(double opacity)`。

