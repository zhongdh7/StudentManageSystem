# 高校学生成绩管理系统

一个用 C 语言编写的控制台学生成绩管理系统，实现学生信息的增删改查与文件持久化。

本项目是一个 C 语言练习项目，主要用来实践**单向链表**、**动态内存管理**和**二进制文件读写**。

另外，仓库内提供了一套零依赖的 Web 前端界面（[`web/`](web/README.md)）。既可以直接双击打开使用本地模式，也可以通过 C 程序自带的 HTTP 服务（[`Server.c`](Server.c)）启动**实时后端模式**：网页通过 `/api` 直接操作 C 程序内存中的学生数据，并自动写入 `data/student.txt`。控制台和 HTTP 服务共用同一个可执行文件，源码中只有 **`main.c` 里的一个 `main` 函数**。

> **示例数据说明**：项目中的示例学生信息（包括界面演示、截图和自动化测试中使用的姓名、学号、成绩）均为虚构，仅用于展示功能，不对应任何真实个人；如与真实信息雷同，纯属巧合。实际导入或手动录入的学生数据除外。

## 功能

| 序号 | 功能 | 说明 |
| :---: | :--- | :--- |
| 1 | 添加学生信息 | 录入学号、姓名、语文、数学、英语成绩 |
| 2 | 打印学生信息 | 按链表顺序输出全部学生 |
| 3 | 删除学生信息 | 按学号删除指定学生 |
| 4 | 查找学生信息 | 按学号查找并显示单个学生 |
| 5 | 修改学生信息 | 按学号定位后修改姓名与三科成绩 |
| 6 | 保存学生信息 | 手动将当前数据写入文件 |
| 0 | 退出系统 | 退出前自动保存数据 |

程序启动时会自动从数据文件加载已有记录，退出时自动保存。

## 项目结构

```
StudentManageSystem/
├── main.c              唯一入口：控制台菜单 / HTTP 服务模式切换
├── Student.h/.c        学生实体：结构体定义、创建、打印、比较
├── ForwardList.h/.c    通用单向链表：节点管理、增删查
├── StudentManager.h/.c 业务逻辑：菜单、各功能的流程控制、文件存取
├── Server.h/.c         C HTTP 服务：REST API + 托管 Web 前端
├── start-server.bat    Windows 下启动服务（使用 build 目录中的可执行文件）
├── data/
│   └── student.txt     数据文件（二进制，运行时生成，不纳入版本控制）
├── web/                Web 前端界面（原生 HTML/CSS/JS，详见 web/README.md）
└── build/              编译输出目录
```

各模块职责：

- **`Student`** —— 数据层。定义学生结构体，提供创建、打印、比较等基本操作。
- **`ForwardList`** —— 容器层。实现一个数据域为 `void *` 的通用单链表，不感知具体存的是什么类型，通过函数指针回调实现打印和比较。
- **`StudentManager`** —— 业务层。持有链表和数据文件路径，负责菜单交互、调度各功能、以及加载/保存。

## 数据结构

学生信息用结构体表示：

```c
typedef struct Student
{
    uint64_t number;   // 学号
    char name[64];     // 姓名
    float chinese;     // 语文成绩
    float math;        // 数学成绩
    float english;     // 英语成绩
} Student;
```

链表为带尾指针的单向链表，头插和尾插均为 O(1)：

```c
typedef struct ForwardList
{
    Node *front;   // 指向第一个数据节点
    Node *tail;    // 指向最后一个数据节点
    int size;      // 链表长度
} ForwardList;
```

## 数据存储

数据以二进制形式保存在 `data/student.txt`，采用固定的 88 字节记录布局，逐字段写入：

| 字段 | 字节数 |
| :--- | :---: |
| 学号（`uint64_t`） | 8 |
| 姓名（`char[64]`，UTF-8，NUL 填充） | 64 |
| 语文 / 数学 / 英语（`float`） | 4 + 4 + 4 |
| 对齐填充（写 0） | 4 |
| **合计** | **88** |

这种写法不再依赖编译器插入的填充字节，文件布局与 Web 前端保持一致；同时每条记录末尾的填充字节固定为 0。程序仍可直接读取旧版 56 字节数据文件，并在保存时自动转换为新格式。

程序使用相对路径 `./data/student.txt` 访问数据文件，**请从项目根目录运行程序**，否则会读写到其他位置。数据文件或 `data/` 目录不存在时会自动创建；读取到损坏或不完整的文件时，程序会拒绝保存并退出，避免覆盖原数据。

## 编译与运行

### 环境要求

- GCC 编译器（推荐 MinGW-w64）
- Windows / Linux / macOS 均可

### 编译

所有 `.c` 文件一起编译成同一个可执行文件。只有 `main.c` 中包含 `main`，`Server.c` 只提供 `server_run()`：

```bash
# Windows / MinGW
gcc -std=c11 -Wall -o StudentManageSystem.exe main.c Student.c ForwardList.c StudentManager.c Server.c -lws2_32

# Linux / macOS 去掉 -lws2_32
gcc -std=c11 -Wall -o StudentManageSystem main.c Student.c ForwardList.c StudentManager.c Server.c
```

### VS Code 一键编译

项目已配置好 `C/C++ Runner`：

- 在 VS Code 中点击 C/C++ Runner 的编译按钮，会生成：
  - `build/Debug/outDebug.exe`
  - `build/Release/outRelease.exe`
- [`.vscode/settings.json`](.vscode/settings.json) 已加入链接参数 `-lws2_32`，否则 Winsock 接口会链接失败；
- [`launch.json`](.vscode/launch.json) 提供两个调试配置：
  - `C/C++ Runner: Debug Session`：控制台模式；
  - `C/C++ Runner: HTTP Server`：以 `server` 参数启动 Web 后端。

### 运行

同一个可执行文件通过命令行参数切换模式：

```bash
# 控制台菜单模式
./StudentManageSystem.exe

# Web 后端模式（默认 8080 端口）
./StudentManageSystem.exe server

# 指定端口
./StudentManageSystem.exe server 9000

# 查看帮助
./StudentManageSystem.exe --help
```

使用 VS Code 编译产物时，把上面的 `StudentManageSystem.exe` 换成 `build/Debug/outDebug.exe` 即可。Windows 也可直接双击 [`start-server.bat`](start-server.bat)，它会自动查找 `build/Debug/outDebug.exe`（或 Release 版本）并以 `server` 模式启动。

## Web 前端界面

`web/` 目录提供了一套原生 HTML / CSS / JavaScript 编写的前端界面，支持两种运行方式：

### 实时后端模式（推荐）

由 C 程序启动本地 HTTP 服务，前端通过 `/api` 直接操作 C 内存中的学生数据，修改会自动写入 `data/student.txt`。

**运行：** 不需要单独编译服务端，使用上面同一个可执行文件即可：

```bash
# Windows / MinGW 编译后
./StudentManageSystem.exe server
# 或指定端口
./StudentManageSystem.exe server 9000
```

使用 VS Code 的构建产物时：

```bash
./build/Debug/outDebug.exe server
```

Windows 也可以直接双击 [`start-server.bat`](start-server.bat)，它会自动查找 `build/Debug/outDebug.exe`（或 Release 版本）并以 `server` 模式启动。

然后用浏览器打开终端提示的地址（默认 **http://127.0.0.1:8080**）。界面侧边栏会显示「C 后端已连接」，此时：

- 添加 / 修改 / 删除学生直接作用于 C 程序的内存链表；
- 每次修改自动保存到 `data/student.txt`；
- 刷新页面或换浏览器，数据仍然来自 C 后端；
- 网页由 C 服务托管，不依赖本地文件服务器。

服务端提供的主要接口：

| 方法 | 路径 | 说明 |
| :---: | :--- | :--- |
| GET | `/api/health` | 服务状态与记录数 |
| GET | `/api/students` | 获取全部学生 |
| POST | `/api/students` | 添加学生 |
| PUT | `/api/students/{number}` | 修改学生（可改学号） |
| DELETE | `/api/students/{number}` | 删除学生 |
| DELETE | `/api/students` | 清空全部学生 |

> 服务只监听 `127.0.0.1`，没有登录鉴权，仅适合本机使用；不要在公网环境直接暴露。
>
> 请勿同时运行控制台程序和 HTTP 服务：二者都会读写同一份 `data/student.txt`，后保存的一方会覆盖先保存的数据。需要切换时先停止其中一个。

### 本地模式（无需服务）

直接双击 `web/index.html`。此时没有 C 服务，页面使用浏览器 `localStorage` 保存数据，并通过导入 / 导出 `student.txt` 与 C 程序交换数据，适合临时查看或不方便启动服务时使用。

![Web 前端数据看板](web/screenshots/01-dashboard-light.png)

功能与 C 控制台菜单一一对应，并额外提供首次使用引导、使用说明、数据看板、成绩分析、深色主题和移动端布局：

- 添加 / 编辑 / 删除学生，按学号或姓名搜索，按成绩筛选、排序、分页；
- 成绩分布、及格率、科目对比与总分排名图表；
- 导入 / 导出 C 程序生成的 `data/student.txt`；
- 实时后端模式下直接读写 C 数据，本地模式下使用浏览器 `localStorage`；
- 支持 JSON / CSV 备份；
- 左侧边栏支持鼠标拖动调整宽度（双击恢复默认，宽度自动记忆）；
- 姓名按 UTF-8 限制 63 字节、学号支持完整 uint64、成绩 0–100，与 C 结构体保持一致。

### 快速开始

1. **推荐**：使用 VS Code 一键编译，然后运行 `build/Debug/outDebug.exe server`，浏览器打开 `http://127.0.0.1:8080`。
2. 首次打开会自动弹出 4 步新手引导，完成后可从侧边栏「使用说明」重新查看。
3. 直接编辑学生，数据会自动保存在 C 后端和 `data/student.txt`。
4. 不启动服务时，也可以双击 `web/index.html` 使用本地模式。

完整说明、二进制格式与测试方法见 [`web/README.md`](web/README.md)。

## 开发环境

- 编辑器：Visual Studio Code
- 编译器：GCC (x86_64-w64-mingw32)
- C 标准：C11
- VS Code 插件：C/C++ Runner（一键编译到 `build/`）

VS Code 的调试配置见 `.vscode/launch.json`。

## 已修复问题（历史记录）

以下问题已在当前版本处理，保留记录便于回溯。

### 严重：可能导致崩溃或数据损坏

- [x] **姓名输入缺少长度限制**
  原实现使用 `scanf("%s", stu->name)`，超长姓名会溢出 32 字节的 `name` 字段。现改为逐行读取、去除首尾空白并校验长度，姓名上限为 63 字节，超长会提示重新输入，不再可能溢出。

- [x] **`remove` 中的 `Student temp` 未初始化**
  现在使用 `Student temp = {0};` 初始化，并且 `student_compare` 只按学号比较，不再读取姓名等未使用字段。

- [x] **`load` 失败时退出会覆盖数据文件**
  `StudentManager` 增加了 `loaded` 标记；加载失败时程序直接退出并跳过保存；`student_manager_save` 也会拒绝在未成功加载时写入。损坏的数据文件不会被覆盖。

### 中等：数据正确性或健壮性

- [x] **`student_alloc` 未初始化内存**
  改用 `calloc`，姓名剩余字节和结构体填充字节会被清零，不再把堆中的垃圾数据写入文件。

- [x] **`student_compare` 的匹配语义与 `flist_find` 不一致**
  现在只按学号比较，并增加了空指针保护；同名学生不会被误删。

- [x] **菜单输入异常时会死循环**
  菜单改为逐行读取 + `strtol` 解析，非法输入会提示并重新显示菜单，不会把错误字符留在输入缓冲区中。

- [x] **`student_alloc()` 的返回值未检查**
  加载、添加以及管理器初始化路径均增加了内存分配失败的检查与提示。

### 轻微：体验与可移植性

- [x] **退出提示会被清屏覆盖**
  退出分支不再执行 `pause` / `cls`；其他操作结束后才等待回车并清屏，而且只有在交互式终端下才会清屏。

- [x] **`fwrite` 直接写入整个结构体**
  改为按固定 88 字节布局逐字段读写：学号 8 字节、姓名 64 字节、三科成绩 12 字节、填充 4 字节（写 0）。旧版 56 字节文件仍可读取并自动迁移，Web 前端同样兼容。

- [x] **`alter` 无法修改姓名**
  「修改学生信息」现在支持修改姓名（直接回车保持不变），并保留三科成绩修改。

- [x] **`main` 中未检查 `student_manager_alloc()` 返回的 `NULL`**
  初始化失败时会打印错误并返回非零退出码。

### 额外加固

- 添加学生时校验学号唯一性，重复学号会被拒绝；
- 三科成绩限制在 0–100 之间，非法输入会提示重新输入；
- 姓名支持中文、英文和空格，最多 63 字节；
- `data/` 目录或数据文件不存在时自动创建；
- 数据文件长度不是 56 的整数倍（部分写入）、读取失败时判定为损坏并拒绝保存；
- Windows 下同时设置输入/输出控制台编码为 UTF-8，避免中文姓名乱码；
- 控制台清屏逻辑区分交互式终端与管道输入，便于自动化测试。

## 许可证

本项目基于 [MIT License](LICENSE) 开源。
