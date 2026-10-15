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
| **字体与排版** | 粗体 (Bold) | `onStyleChange({ bold: !style.bold })` | 已实装 | 原生富文本/Cell 属性修改 |
| | 斜体 (Italic) | `onStyleChange({ italic: !style.italic })` | 已实装 | 原生富文本/Cell 属性修改 |
| | 下划线 (Underline) | `onStyleChange({ underline: !style.underline })` | 已实装 | 原生富文本/Cell 属性修改 |
| | 边框 (Border) | `onStyleChange({ border: !style.border })` | 已实装 | 原生边框网格渲染 |
| | 文字颜色 (Color) | `onStyleChange({ color: hex })` | 已实装 | 原生 ColorPicker / 调色盘 |
| | 背景填充 (Fill) | `onStyleChange({ fill: hex })` | 已实装 | 原生 ColorPicker / 调色盘 |
| **对齐方式** | 水平对齐 | `onStyleChange({ align: 'left' \| 'center' \| 'right' })` | 已实装 | 原生对齐方式映射 |
| **数字格式** | 格式类型 | `general` / `number` / `currency` / `percent` | 已实装 | 共享 `shared/sheet-format.ts` |
| | 货币快捷键 | `onStyleChange({ numberFormat: 'currency' })` | 已实装 | 一键设置货币格式 |
| | 百分比快捷键 | `onStyleChange({ numberFormat: 'percent' })` | 已实装 | 一键设置百分比格式 |
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
| **行与列** | 上方插入行 | `onStructure('row', 'insert')` | 已实装 | 触发结构变更，光标跟随 |
| | 左侧插入列 | `onStructure('col', 'insert')` | 已实装 | 触发结构变更，光标跟随 |
| | 删除选中行/列 | `onStructure(axis, 'delete')` | 已实装 | 校验末尾及内容后安全删除 |
| **交互组件** | 复选框 (Checkbox) | 单元格插入标记并支持勾选状态切换 | 已实装 | 原生 Checkbox 渲染 |
| | 下拉列表 (Dropdown) | 单元格配置候选值列表及数据验证 | 已实装 (引导弹窗) | 原生 Picker / 下拉列表弹层 |
| | 超链接 (Hyperlink) | 插入 URL 链接并在点击时调起外部跳转 | 已实装 (引导弹窗) | 原生打开系统浏览器 |
| | 图片插入 (Image) | 单元格嵌入网络图片或本地图片 | 已实装 (引导弹窗) | 调用系统相册选择器上传/引用 |
| **可视化图表** | 柱状图/折线图/饼图 | 根据选区数据生成轻量图表预览 | 已实装 (引导弹窗) | 原生 Chart 组件渲染 |
| | 数据透视表 (Pivot) | 多维交叉报表构建向导 | 已实装 (引导弹窗) | 聚合引擎计算与副表生成 |
| **工作区容量** | 追加 50 行 / 5 列 | 动态扩展行数列数至 `MAX_ROWS` / `MAX_COLUMNS` | 已实装 | 原生工作表尺寸扩展 |

---

### 2.3 【数据】Tab (`data`)
专注数据组织、清洗、验证与自动计算。

| 模块 | 功能项 | 动作与接口定义 | Web 状态 | 客户端实现建议 |
| :--- | :--- | :--- | :--- | :--- |
| **排序与筛选** | 升序与降序 | 选区多行按基准列自然排序，数值/文本/空值兜底 | 已实装 | 共享 `shared/sheet-sort.ts` |
| | 自动筛选 (AutoFilter) | 列头增加筛选漏斗浮标，支持值筛选 | 已实装 (引导弹窗) | 原生筛选下拉菜单 |
| **数据清洗** | 向下/向右填充 | 选区首行/首列相对引用复制，快捷键 `⌘D` / `⌘R` | 已实装 | 共享 `shared/sheet-fill.ts` |
| | 数据有效性 | 单元格输入规则（数值范围、文本长度、下拉菜单） | 已实装 (引导弹窗) | 拦截输入并校验 |
| | 重复项处理 | 选区重复数据高亮标记与一键去重 | 已实装 (引导弹窗) | 扫描哈希去重 |
| | 文本分列 | 根据逗号、空格或分号拆分单列数据至相邻列 | 已实装 (引导弹窗) | 字符串分割并写入相邻列 |
| **尺寸微调** | 自定义行高与列宽 | 选中区域精确指定像素尺寸（24~300px / 48~600px） | 已实装 | 原生表格行列尺寸适配 |

---

### 2.4 【公式】Tab (`formula`)
专注函数库导航、公式审计与计算引擎调度。

| 模块 | 功能项 | 动作与接口定义 | Web 状态 | 客户端实现建议 |
| :--- | :--- | :--- | :--- | :--- |
| **常用函数** | SUM / AVERAGE / COUNT / MAX / MIN / IF | 点击插入标准函数签名，并自动带入选区范围 | 已实装 | 自动填充公式并调起软键盘/公式栏 |
| **分类函数库** | 逻辑函数 | IF, AND, OR, NOT, IFERROR | 已实装 | 共享 `shared/formulas.ts` 引擎 |
| | 数学与三角 | SUM, ROUND, ABS, INT, MOD, SQRT | 已实装 | 共享 `shared/formulas.ts` 引擎 |
| | 统计与查找 | AVERAGE, COUNT, MAX, MIN, VLOOKUP | 已实装 | 共享 `shared/formulas.ts` 引擎 |
| **计算状态** | 自动重新计算 | 单元格值变更时依赖拓扑图自动重算与展示 | 已实装 | 纯函数计算器缓存管理 |

---

### 2.5 【视图】Tab (`view`)
专注视觉模式切换、辅助线标、冻结窗格与视口缩放。

| 模块 | 功能项 | 动作与接口定义 | Web 状态 | 客户端实现建议 |
| :--- | :--- | :--- | :--- | :--- |
| **阅读辅助** | 护眼模式 (Eye Care) | 一键切换柔和浅米绿护眼底色 (`#f4f8f0`) | 已实装 | 切换表格主题/调色板 |
| | 高亮十字行列 (Crosshairs) | 当前选中单元格所在的整行与整列柔和高亮辅助定位 | 已实装 | 原生 Cell 背景绘制判断 |
| **冻结窗格** | 冻结首行 / 首列 | 表头固定悬浮滚动，保持数据上下文可见 | 已实装 | 共享 `shared/sheet-view.ts` |
| | 冻结至当前单元格 | 以选中单元格左上角为锚点多行多列同时冻结 | 已实装 | 原生粘性布局 (Sticky Header) |
| | 取消冻结 | 恢复全自由滚动 | 已实装 | 重置 frozenRows / frozenColumns |
| **界面元素** | 显示/隐藏网格线 | 切换单元格边框线渲染（`showGridlines`） | 已实装 | 原生画笔开关 Grid lines |
| | 显示/隐藏行号列标 | 切换表头字母与左侧序号栏（`showHeadings`） | 已实装 | 原生 Header 显示控制 |
| | 隔行标记 (Zebra Stripe) | 偶数行轻微灰/淡绿交替变色，提升多列表格可读性 | 已实装 | 偶数行条件样式 |
| **视口控制** | 缩放比例 (Zoom) | 75%、100%、125%、150% 视口缩放控制 | 已实装 | 缩放绘制画布 |
| | 全屏显示 | 调用浏览器/系统全屏 API 隐藏工具栏与边框 | 已实装 | 沉浸式全屏视图 |

---

## 3. 跨端客户端迁移与实现指南

### 3.1 跨平台共享内核 (`shared/`)
为确保 iOS / Android / HarmonyOS / Desktop 与 Web 端行为完全一致，所有业务与数据逻辑均必须复用或严格对齐 `shared/` 下的统一实现：
1. **公式与依赖计算**：[`shared/formulas.ts`](file:///Users/liang/Documents/AI_CODE/WPX/shared/formulas.ts)
2. **选区算法与矩形运算**：[`shared/sheet-selection.ts`](file:///Users/liang/Documents/AI_CODE/WPX/shared/sheet-selection.ts)
3. **范围填充与相对引用偏移**：[`shared/sheet-fill.ts`](file:///Users/liang/Documents/AI_CODE/WPX/shared/sheet-fill.ts)
4. **范围排序与多行联动**：[`shared/sheet-sort.ts`](file:///Users/liang/Documents/AI_CODE/WPX/shared/sheet-sort.ts)
5. **冻结窗格偏移与坐标**：[`shared/sheet-view.ts`](file:///Users/liang/Documents/AI_CODE/WPX/shared/sheet-view.ts)
6. **行列结构变更与公式平移**：[`shared/sheet-structure.ts`](file:///Users/liang/Documents/AI_CODE/WPX/shared/sheet-structure.ts)
7. **单元格格式与显示文本生成**：[`shared/sheet-format.ts`](file:///Users/liang/Documents/AI_CODE/WPX/shared/sheet-format.ts)

### 3.2 布局形态适配准则
- **桌面端 / iPad / 平板横屏**：
  - 采用本规范的 **标准 Ribbon 顶部横向选项卡面板**，展开二级功能组，支持快捷键直达。
- **手机端（窄屏竖屏）**：
  - 顶部仅保留轻量 Tab 切换胶囊或常用快捷按钮；
  - 二级菜单收拢为 **底部弹出抽屉 (Bottom ActionSheet / Drawer)**，按「格式」、「插入」、「数据」、「公式」、「视图」分别展开垂直列表，保证单手触控操作面积 $\ge 44\times 44$ pt。

### 3.3 样式兼容性铁律
- **严禁使用 `Color.withValues(alpha: ...)`**：OpenHarmony 及旧版本 Flutter 运行时均不支持，必须统一使用 `Color.withOpacity(double opacity)`。
