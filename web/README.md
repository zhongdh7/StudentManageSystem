# 学籍云 · Web 前端界面

高校学生成绩管理系统的 Web 前端，配套本仓库的 C 语言后端（控制台 + HTTP 服务）。

- 原生 **HTML / CSS / JavaScript**，零第三方依赖，可直接双击运行，也可由 C 服务托管。
- 覆盖 C 后端菜单中的全部功能：添加、打印（列表）、删除、查找、修改、保存。
- 与 C 程序的 `data/student.txt` **二进制格式完全互通**：网页可以导入 C 生成的数据文件，也可以导出同名文件给 C 程序读取。
- 新增**实时后端模式**：由 C 程序启动 HTTP 服务后，前端通过 `/api` 直接操作 C 内存数据，修改自动写入 `data/student.txt`。
- 数据看板、成绩分析、深色主题、移动端响应式、键盘快捷键。
- 首次访问自动弹出 4 步新手引导；侧边栏「使用说明」页面可随时重新查看。
- 侧边栏支持**鼠标拖动调整宽度**：拖动右边缘伸缩，双击恢复默认，宽度自动记忆。

> **示例数据说明**：界面中的示例学生信息、截图以及自动化测试用例中使用的姓名、学号、成绩均为虚构，仅用于演示和测试，不对应任何真实个人；实际导入或手动录入的学生数据除外。

![数据看板](screenshots/01-dashboard-light.png)

## 快速开始

### 模式一：实时后端模式（推荐）

C 程序现在只有一个入口：同一个可执行文件既能开控制台菜单，也能启动 HTTP 服务。

```bash
# Windows / MinGW
gcc -std=c11 -Wall -o StudentManageSystem.exe main.c Student.c ForwardList.c StudentManager.c Server.c -lws2_32
./StudentManageSystem.exe server

# Linux / macOS 去掉 -lws2_32
gcc -std=c11 -Wall -o StudentManageSystem main.c Student.c ForwardList.c StudentManager.c Server.c
./StudentManageSystem server
```

如果使用 VS Code 的 C/C++ Runner 一键编译，则运行：

```bash
./build/Debug/outDebug.exe server
```

Windows 也可以直接双击项目根目录的 `start-server.bat`，它会自动查找 `build/Debug/outDebug.exe`（或 Release 版本）并以 `server` 模式启动。

然后打开终端提示的地址（默认 **http://127.0.0.1:8080**）。

此时前端会自动识别 C 后端：

- 侧边栏显示「C 后端已连接」；
- 添加 / 修改 / 删除直接操作 C 内存链表；
- 数据自动保存到 `data/student.txt`，刷新页面或换浏览器仍读取同一份数据；
- 数据管理页会显示「C 后端数据」和写入提示。

### 模式二：本地模式（无需服务）

直接双击打开 `web/index.html`（推荐 Chrome / Edge）。此时没有 C 服务，页面使用浏览器 `localStorage` 保存数据，并通过导入 / 导出 `student.txt` 与 C 程序交换数据。

> 本地模式不需要编译，不需要启动服务器，适合临时查看或演示。

## 第一次使用

首次打开页面时，会自动弹出 4 步新手引导：

1. 认识界面与示例数据；
2. 了解数据导入、管理和备份方式；
3. 掌握录入、管理与导出三步流程；
4. 选择起点：导入学生数据文件、先浏览当前数据，或查看完整说明。

完成或关闭引导后不会再自动弹出；随时可以点击侧边栏「使用说明」重新查看，
或在该页面点击「重新观看引导」。

| 首次使用引导 | 使用说明页面 |
| :---: | :---: |
| ![首次使用引导](screenshots/00-welcome.png) | ![使用说明](screenshots/10-guide.png) |

## 功能对照

| C 控制台菜单 | Web 界面 |
| :--- | :--- |
| 1. 添加学生信息 | 右上角「添加学生」或学生管理页按钮，表单录入并校验 |
| 2. 打印学生信息 | 「学生管理」表格；支持搜索、筛选、排序、分页 |
| 3. 删除学生信息 | 表格行内删除；删除后提示条可撤销 |
| 4. 查找学生信息 | 顶部搜索框（学号 / 姓名），或按及格情况筛选 |
| 5. 修改学生信息 | 表格行内编辑，可改学号、姓名与三科成绩 |
| 6. 保存学生信息 | 实时后端模式写入 `data/student.txt`；本地模式写入 `localStorage`；均可导出 `student.txt` / JSON / CSV |
| 0. 退出系统 | 关闭页面即可，数据已自动保存 |
| —— | 额外提供：新手引导、使用说明、数据看板、成绩分析、深色主题、示例数据 |

## 与 C 程序共用数据

Web 界面与 C 程序通过同一个二进制文件格式交换数据，互不影响对方的代码。

### 从 C 导入到网页

1. 备份 C 程序的 `data/student.txt`（避免误操作）。
2. 打开网页，进入「数据管理」。
3. 在「学生数据文件」卡片中选择文件，或直接拖入 `data/student.txt`。
4. 选择「覆盖当前数据」或「合并导入」，确认即可。

### 从网页导出给 C

1. 进入「数据管理」，点击「导出 student.txt」。
2. 用下载得到的 `student.txt` 替换项目中的 `data/student.txt`（建议先备份原文件）。
3. 在项目根目录运行 C 程序：

```bash
./StudentManageSystem.exe
# 或
./build/Debug/outDebug.exe
```

> C 程序使用相对路径 `./data/student.txt`，请务必在项目根目录运行；
> 导出的文件与 C 程序当前使用的 88 字节固定布局一致，可直接替换 `data/student.txt`。

## 二进制格式

前端与 C 程序共用同一套固定字段布局，字段采用小端序（x86-64 / MinGW-w64 GCC）：

| 偏移 | 长度 | 字段 | 说明 |
| :---: | :---: | :--- | :--- |
| 0 | 8 | `uint64_t number` | 学号，小端序；前端按 BigInt 处理，支持完整 uint64 范围 |
| 8 | 64 | `char name[64]` | 姓名，UTF-8 编码，NUL 填充；前端限制最多 63 字节 |
| 72 | 4 | `float chinese` | 语文成绩，小端序 |
| 76 | 4 | `float math` | 数学成绩，小端序 |
| 80 | 4 | `float english` | 英语成绩，小端序 |
| 84 | 4 | 对齐填充 | 前端导出时写 0 |
| **合计** | **88** | 固定布局 | 每条记录 88 字节 |

导入时会校验：

- 文件长度必须是 88 的整数倍；旧版 56 字节文件仍可识别，导入后自动转换为新格式；
- 学号必须在 `uint64` 范围内，重复学号会被跳过并提示；
- 姓名必须非空且不超过 63 个 UTF-8 字节（保证固定姓名段有结尾 `\0`）；
- 三科成绩必须是 0–100 的有限浮点数。

成绩显示与 C 程序一致，保留一位小数（对应 `printf("%.1f")`）。

## 项目结构

```
web/
├── index.html                 单页界面（四个视图 + SVG 图标系统）
├── css/
│   └── style.css              设计系统、响应式、深色主题
├── js/
│   ├── core.js                纯数据逻辑：校验、二进制编解码、统计、存储（可被 Node 测试）
│   └── app.js                 界面逻辑：渲染、表单、导入导出、弹窗、Toast
├── screenshots/               界面截图（由端到端测试生成）
├── tests/
│   ├── core.test.mjs          core.js 单元测试（24 项）
│   └── browser-smoke.mjs      Edge headless 端到端测试（66 项，生成截图）
└── README.md
```

## 数据存储

学生数据的存放位置取决于运行模式：

- **实时后端模式**：学生数据保存在 C 后端内存中，每次修改自动写入项目根目录的 `data/student.txt`；
- **本地模式**：学生数据保存在浏览器 `localStorage` 的 `sms.students.v1` 中。

界面偏好（两种模式都使用 `localStorage`）：

| `localStorage` 键 | 内容 |
| :--- | :--- |
| `sms.students.v1` | 本地模式的学生记录、示例数据标记、上次保存时间 |
| `sms.activity.v1` | 本地模式的最近 30 条操作记录 |
| `sms.theme.v1` | 浅色 / 深色主题偏好 |
| `sms.onboarded.v1` | 是否已完成首次使用引导 |
| `sms.sidebar.width.v1` | 侧边栏宽度（拖拽后自动记忆） |

实时后端模式下，清除浏览器数据不会删除 C 后端的学生记录；本地模式下清除站点数据会同时清除学生记录。无论哪种模式，都建议定期通过「数据管理」导出 `student.txt` 或 JSON 备份。

## 测试

### 数据逻辑单元测试

```bash
node --test web/tests/core.test.mjs
```

覆盖：字段校验、uint64 边界、UTF-8 字节限制、二进制编解码、真实 `data/student.txt`
解析、统计、排序筛选、JSON/CSV、`StudentStore` 持久化、撤销重复学号保护、
BOM JSON、CSV 公式注入、非法 UTF-8 姓名与活动记录清洗等。

### 浏览器端到端测试

```bash
node web/tests/browser-smoke.mjs
```

要求：

- Windows + 已安装 Microsoft Edge（可用 `EDGE_PATH` 环境变量指定路径）；
- Node.js 22+（使用内置 `WebSocket`）。

测试会启动 headless Edge，逐项验证首次使用引导、使用说明页面、侧边栏拖动伸缩、页面加载、增删改查、搜索排序分页、
二进制导入导出（含导出文件字节校验）、深色主题、移动端布局、焦点管理与
`file://` 打开，并重新生成 `screenshots/`；运行期间若出现任何 JavaScript 错误会判定失败。

> 注意：测试会重写 `web/screenshots/` 下的截图，并临时启动一个本地静态服务器
> 与 headless Edge。默认端口为 8137 / 9333，可通过 `SMS_TEST_HTTP_PORT` 和
> `SMS_TEST_DEBUG_PORT` 环境变量覆盖。

## 截图

| 首次使用引导 | 选择起点 |
| :---: | :---: |
| ![首次使用引导](screenshots/00-welcome.png) | ![选择起点](screenshots/00-welcome-start.png) |

| 数据看板 | 学生管理 |
| :---: | :---: |
| ![数据看板](screenshots/01-dashboard-light.png) | ![学生管理](screenshots/02-students.png) |

| 添加学生 | 成绩分析 |
| :---: | :---: |
| ![添加学生](screenshots/03-add-form.png) | ![成绩分析](screenshots/04-analytics.png) |

| 数据管理 | 深色主题 |
| :---: | :---: |
| ![数据管理](screenshots/05-data.png) | ![深色主题](screenshots/06-dashboard-dark.png) |

| 使用说明 | 移动端看板 |
| :---: | :---: |
| ![使用说明](screenshots/10-guide.png) | ![移动端看板](screenshots/07-mobile-dashboard.png) |

| 移动端学生管理 | 移动端使用说明 |
| :---: | :---: |
| ![移动端学生管理](screenshots/08-mobile-students.png) | ![移动端使用说明](screenshots/11-mobile-guide.png) |

| 侧边栏拖动伸缩 | 导入数据 |
| :---: | :---: |
| ![侧边栏拖动伸缩](screenshots/12-sidebar-resized.png) | ![导入数据](screenshots/09-import-dialog.png) |

## 设计说明

- **配色**：靛蓝主色 + 深色导航栏，成绩用绿 / 蓝 / 琥珀 / 红四档语义色；
- **布局**：桌面端侧边栏 + 卡片栅格；侧边栏右边缘可拖动伸缩（208–360px），
  `≤980px` 侧边栏收起为抽屉；`≤760px` 学生表格自动切换为卡片布局，并提供排序下拉框；
- **主题**：通过 CSS 变量实现浅色 / 深色主题，偏好保存在 `localStorage`；
- **无障碍**：语义化标题与表格、`aria-label`、`aria-sort`、焦点环、
  `Esc` 关闭弹窗、`Ctrl / Cmd + K` 聚焦搜索框；
- **图表**：纯 CSS / 内联 SVG 绘制，无外部 CDN，完全离线可用。

## 已知限制

- **本地模式**下，网页与 C 程序之间仍是文件交换，需要手动导入 / 导出；使用 C 服务托管时则是实时同步。
- 实时后端模式只监听 `127.0.0.1`，没有登录鉴权，仅适合本机使用；服务为单线程，适合个人/小规模场景。
- 实时后端模式需要从项目根目录启动可执行文件（或 `start-server.bat`），否则找不到 `web/` 和 `data/`。
- 不要同时运行 C 控制台程序和 HTTP 服务：两者都会写 `data/student.txt`，后保存的会覆盖先保存的数据。
- 本地模式的学生数据存在浏览器 `localStorage`，换浏览器或清除站点数据后需要重新导入备份。
- 导入 C 文件时会跳过成绩不在 0–100、学号重复或姓名不是合法 UTF-8 的记录；
  被跳过的记录不会进入网页，若再覆盖导出，它们将不再存在于文件中，导入前请先备份。
- 「撤销删除」只保留最近一次删除，刷新页面后失效；如果学号已被重新添加，撤销会被拒绝。
- 示例数据仅在本地模式首次打开且本地无数据时自动载入；清空后可手动点击「载入示例数据」。
- 二进制格式采用固定 88 字节布局（小端序，旧版 56 字节可自动迁移）；C 端已逐字段读写，
  不再依赖结构体填充字节，但跨大端平台使用旧数据文件仍需做字节序转换。

## 实时后端架构

- C 侧新增 [`Server.c`](../Server.c)，复用 `StudentManager`、`ForwardList`、`Student`，在 `127.0.0.1` 上提供 `/api/*` JSON 接口，并托管 `web/` 静态文件；`main.c` 是唯一入口，通过 `server` 参数进入服务模式。
- 服务端在返回 `index.html` 时会注入后端标记；前端检测到标记后，启动时通过 `/api/students` 加载数据，后续增删改直接调用 API。
- 每次修改由 C 后端自动 `student_manager_save` 写入 `data/student.txt`。
- 如果直接打开 `web/index.html` 或使用普通静态服务器，检测不到后端标记，前端自动回退到本地 `localStorage` 模式。

---

返回项目根目录：[README.md](../README.md)
