# 高校学生成绩管理系统

一个用 C 语言编写的控制台学生成绩管理系统，实现学生信息的增删改查与文件持久化。

本项目是一个 C 语言练习项目，主要用来实践**单向链表**、**动态内存管理**和**二进制文件读写**。

## 功能

| 序号 | 功能 | 说明 |
| :---: | :--- | :--- |
| 1 | 添加学生信息 | 录入学号、姓名、语文、数学、英语成绩 |
| 2 | 打印学生信息 | 按链表顺序输出全部学生 |
| 3 | 删除学生信息 | 按学号删除指定学生 |
| 4 | 查找学生信息 | 按学号查找并显示单个学生 |
| 5 | 修改学生信息 | 按学号定位后修改三科成绩 |
| 6 | 保存学生信息 | 手动将当前数据写入文件 |
| 0 | 退出系统 | 退出前自动保存数据 |

程序启动时会自动从数据文件加载已有记录，退出时自动保存。

## 项目结构

```
StudentManageSystem/
├── main.c              程序入口
├── Student.h/.c        学生实体：结构体定义、创建、打印、比较
├── ForwardList.h/.c    通用单向链表：节点管理、增删查
├── StudentManager.h/.c 业务逻辑：菜单、各功能的流程控制、文件存取
├── data/
│   └── student.txt     数据文件（二进制，运行时生成，不纳入版本控制）
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
    char name[32];     // 姓名
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

数据以二进制形式保存在 `data/student.txt`，每条记录就是结构体内存的原始字节，因此单条记录占 `sizeof(Student)` 字节（当前为 56 字节）。

程序使用相对路径 `./data/student.txt` 访问数据文件，**请从项目根目录运行程序**，否则会读写到其他位置。

## 编译与运行

### 环境要求

- GCC 编译器（推荐 MinGW-w64）
- Windows / Linux / macOS 均可

### 编译

在项目根目录执行：

```bash
gcc -std=c11 -Wall -o StudentManageSystem.exe main.c Student.c ForwardList.c StudentManager.c
```

### 运行

```bash
./StudentManageSystem.exe
```

启动后按菜单提示输入序号即可。

## 开发环境

- 编辑器：Visual Studio Code
- 编译器：GCC (x86_64-w64-mingw32)
- C 标准：C11

VS Code 的调试配置见 `.vscode/launch.json`。

## 已知问题与待办

以下是当前版本中已知但尚未修复的问题，按严重程度排列，留待后续处理。

### 严重：可能导致崩溃或数据损坏

- [ ] **`scanf("%s", stu->name)` 缺少宽度限制**
  姓名字段只有 32 字节，输入超过 31 个字符时会溢出，覆盖结构体后面的 `chinese`/`math`/`english` 字段乃至堆块的管理信息，随后任何堆操作都会导致程序崩溃。应改为 `scanf("%31s", stu->name)`。

- [ ] **`remove` 中的 `Student temp` 未初始化**
  `student_manager_remove` 只设置了 `temp.number` 就去调用 `flist_remove`，而 `student_compare` 在学号不匹配时还会用 `strcmp` 比较姓名，此时读的是 `temp` 未初始化的栈内存。若该内存中恰好没有 `\0`，`strcmp` 会越界读取。应声明为 `Student temp = {0};`。

- [ ] **`load` 失败时退出会覆盖数据文件**
  `student_manager_run` 未检查 `student_manager_load` 的返回值。一旦加载失败，链表为空，而退出时的保存操作以 `"wb"` 模式打开文件，该模式会先把文件截断为零字节。

### 中等：数据正确性或健壮性

- [ ] **`student_alloc` 未初始化内存，垃圾字节被写入文件**
  `student_alloc` 只用 `malloc` 申请内存，`scanf` 也只写入姓名的前几个字符，剩余字节保留堆中的原有内容，最终被 `fwrite` 原样写入数据文件。改用 `calloc` 即可解决。

- [ ] **`student_compare` 的匹配语义与 `flist_find` 不一致**
  `student_compare` 在**学号相同或姓名相同**时都返回 `true`，而 `flist_remove` 删除的是第一个匹配的节点。当存在同名学生时，可能删错对象。删除操作应只按学号比较。

- [ ] **`scanf("%d", &option)` 类型不匹配且输入异常时会死循环**
  `option` 是枚举类型 `Option`，而 `%d` 要求 `int *`（编译器会给出警告）。更麻烦的是：如果输入的不是数字，`scanf` 失败后字符仍留在输入缓冲区中，下一轮循环会读到同一个字符，导致无限刷屏。应检查 `scanf` 的返回值并在失败时清空缓冲区。

- [ ] **`student_alloc()` 的返回值未检查**
  `student_manager_load` 中调用 `student_alloc()` 后未判空，若 `malloc` 失败，下一次 `fread` 会以 `NULL` 作为目标地址而崩溃。

### 轻微：体验与可移植性

- [ ] **退出提示会被清屏覆盖**
  `Quit` 分支打印「成功退出系统！」之后仍会执行 `system("pause")` 和 `system("cls")`，用户按任意键后屏幕被清空，看不到提示信息。

- [ ] **`fwrite` 直接写入整个结构体，包含填充字节**
  结构体中为对齐而存在的填充字节（当前每条记录 4 字节）也会被写入文件。同一编译器读写没有问题，但换编译器或平台后结构体布局可能改变，导致旧数据文件无法读取。更稳妥的做法是逐字段读写。

- [ ] **`alter` 无法修改姓名**
  当前只能修改三科成绩，若要修改姓名只能删除后重新添加。

- [ ] **`main` 中未检查 `student_manager_alloc()` 返回的 `NULL`**

## 许可证

本项目基于 [MIT License](LICENSE) 开源。
