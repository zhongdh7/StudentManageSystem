#include "StudentManager.h"
#include <ctype.h>
#include <errno.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "ForwardList.h"
#include "Student.h"
#include <stdbool.h>

#ifdef _WIN32
#include <direct.h>
#include <io.h>
#else
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>
#endif

#define DATA_DIRECTORY "data"
#define DEFAULT_DATA_FILE "./data/student.txt"
#define RECORD_PADDING_SIZE 4

// 新版记录：8(学号) + 64(姓名) + 12(三科成绩) + 4(填充) = 88 字节
#define STUDENT_RECORD_SIZE (sizeof(uint64_t) + STUDENT_NAME_SIZE + sizeof(float) * 3 + RECORD_PADDING_SIZE)
// 旧版记录：8 + 32 + 12 + 4 = 56 字节，用于读取历史数据文件
#define LEGACY_STUDENT_NAME_SIZE 32
#define LEGACY_STUDENT_RECORD_SIZE (sizeof(uint64_t) + LEGACY_STUDENT_NAME_SIZE + sizeof(float) * 3 + RECORD_PADDING_SIZE)

enum Option
{
    Quit,
    Entry,
    Print,
    Remove,
    Find,
    Alter,
    Save
};

typedef enum Option Option;

_Static_assert(sizeof(uint64_t) == 8, "数据文件要求 uint64_t 为 8 字节");
_Static_assert(sizeof(float) == 4, "数据文件要求 float 为 4 字节");
_Static_assert(STUDENT_NAME_SIZE == 64, "数据文件要求姓名字段为 64 字节");
_Static_assert(STUDENT_RECORD_SIZE == 88, "新版数据记录应为 88 字节");
_Static_assert(LEGACY_STUDENT_RECORD_SIZE == 56, "旧版数据记录应为 56 字节");

/* ------------------------------------------------------------------ *
 * 输入辅助
 * ------------------------------------------------------------------ */

static bool read_line(char *buffer, size_t capacity)
{
    if (!buffer || capacity == 0)
        return false;

    if (fgets(buffer, (int)capacity, stdin) == NULL)
    {
        buffer[0] = '\0';
        return false;
    }

    size_t length = strlen(buffer);
    if (length > 0 && buffer[length - 1] == '\n')
    {
        buffer[length - 1] = '\0';
    }
    else
    {
        // 丢弃超长行剩余部分，避免影响下一次输入
        int ch;
        while ((ch = getchar()) != '\n' && ch != EOF)
        {
        }
    }
    return true;
}

static char *trim_in_place(char *text)
{
    if (!text)
        return text;

    while (*text && isspace((unsigned char)*text))
        text++;

    char *end = text + strlen(text);
    while (end > text && isspace((unsigned char)end[-1]))
        end--;
    *end = '\0';
    return text;
}

static bool read_uint64(const char *prompt, uint64_t *value)
{
    char line[128];
    while (true)
    {
        printf("%s", prompt);
        if (!read_line(line, sizeof(line)))
            return false;

        char *text = trim_in_place(line);
        if (*text == '\0')
        {
            printf("输入不能为空，请重新输入。\n");
            continue;
        }
        if (!isdigit((unsigned char)*text))
        {
            printf("学号只能包含数字，请重新输入。\n");
            continue;
        }

        errno = 0;
        char *end = NULL;
        unsigned long long parsed = strtoull(text, &end, 10);
        if (end == text || errno == ERANGE)
        {
            printf("学号输入无效或数值过大，请重新输入。\n");
            continue;
        }
        while (*end && isspace((unsigned char)*end))
            end++;
        if (*end != '\0')
        {
            printf("学号只能包含数字，请重新输入。\n");
            continue;
        }

        *value = (uint64_t)parsed;
        return true;
    }
}

static bool read_score(const char *prompt, float *value)
{
    char line[128];
    while (true)
    {
        printf("%s", prompt);
        if (!read_line(line, sizeof(line)))
            return false;

        char *text = trim_in_place(line);
        if (*text == '\0')
        {
            printf("输入不能为空，请重新输入。\n");
            continue;
        }

        errno = 0;
        char *end = NULL;
        float parsed = strtof(text, &end);
        if (end == text || errno == ERANGE)
        {
            printf("成绩输入无效，请重新输入。\n");
            continue;
        }
        while (*end && isspace((unsigned char)*end))
            end++;
        if (*end != '\0')
        {
            printf("成绩输入无效，请重新输入。\n");
            continue;
        }
        if (!(parsed >= 0.0f && parsed <= 100.0f))
        {
            printf("成绩需在 0–100 之间，请重新输入。\n");
            continue;
        }

        *value = parsed;
        return true;
    }
}

static bool read_student_name(const char *prompt, char *name, size_t capacity)
{
    char line[256];
    while (true)
    {
        printf("%s", prompt);
        if (!read_line(line, sizeof(line)))
            return false;

        char *text = trim_in_place(line);
        if (*text == '\0')
        {
            printf("姓名不能为空，请重新输入。\n");
            continue;
        }
        if (strlen(text) >= capacity)
        {
            printf("姓名过长，最多 21 个汉字（或 63 个英文字母）。\n");
            continue;
        }

        memcpy(name, text, strlen(text) + 1);
        return true;
    }
}

/* ------------------------------------------------------------------ *
 * 控制台辅助
 * ------------------------------------------------------------------ */

static bool input_is_interactive(void)
{
#ifdef _WIN32
    return _isatty(_fileno(stdin)) != 0;
#else
    return isatty(fileno(stdin)) != 0;
#endif
}

static void clear_console(void)
{
    // 输入被重定向时（自动化测试 / 管道）不清屏，避免影响输出
    if (!input_is_interactive())
        return;

#ifdef _WIN32
    system("cls");
#else
    system("clear");
#endif
}

static void wait_for_enter(void)
{
    char line[8];
    printf("\n按回车键继续...");
    (void)read_line(line, sizeof(line));
}

/* ------------------------------------------------------------------ *
 * 数据文件辅助
 * ------------------------------------------------------------------ */

static int ensure_data_directory(void)
{
#ifdef _WIN32
    int status = _mkdir(DATA_DIRECTORY);
#else
    int status = mkdir(DATA_DIRECTORY, 0755);
#endif
    if (status != 0 && errno != EEXIST)
    {
        perror("创建 data 目录失败");
        return -1;
    }
    return 0;
}

static int create_empty_data_file(const char *filename)
{
    FILE *fp = fopen(filename, "wb");
    if (!fp)
    {
        perror("创建数据文件失败");
        return -1;
    }
    fclose(fp);
    return 0;
}

/*
 * 新版数据文件固定为 88 字节/条：
 *   uint64 学号(8) + char 姓名(64) + float 语文(4) + 数学(4) + 英语(4) + 填充(4)
 * 逐字段读写，既不依赖结构体填充字节，也与 Web 前端格式保持兼容。
 */
static int write_student(FILE *fp, const Student *stu)
{
    if (!fp || !stu)
        return -1;

    uint64_t number = stu->number;
    char name[STUDENT_NAME_SIZE];
    float chinese = stu->chinese;
    float math = stu->math;
    float english = stu->english;
    uint32_t padding = 0;

    memset(name, 0, sizeof(name));
    size_t name_length = strlen(stu->name);
    if (name_length >= sizeof(name))
        name_length = sizeof(name) - 1;
    memcpy(name, stu->name, name_length);

    if (fwrite(&number, sizeof(number), 1, fp) != 1 ||
        fwrite(name, sizeof(name), 1, fp) != 1 ||
        fwrite(&chinese, sizeof(chinese), 1, fp) != 1 ||
        fwrite(&math, sizeof(math), 1, fp) != 1 ||
        fwrite(&english, sizeof(english), 1, fp) != 1 ||
        fwrite(&padding, sizeof(padding), 1, fp) != 1)
    {
        return -1;
    }
    return 0;
}

/*
 * 返回值：1 读取成功，0 正常到达文件末尾，-1 读取错误 / 记录不完整。
 */
static int read_student(FILE *fp, Student *stu)
{
    if (!fp || !stu)
        return -1;

    uint64_t number;
    char name[STUDENT_NAME_SIZE];
    float chinese;
    float math;
    float english;
    uint32_t padding;

    if (fread(&number, sizeof(number), 1, fp) != 1)
        return feof(fp) ? 0 : -1;

    if (fread(name, sizeof(name), 1, fp) != 1 ||
        fread(&chinese, sizeof(chinese), 1, fp) != 1 ||
        fread(&math, sizeof(math), 1, fp) != 1 ||
        fread(&english, sizeof(english), 1, fp) != 1 ||
        fread(&padding, sizeof(padding), 1, fp) != 1)
    {
        return -1;
    }
    (void)padding;

    name[STUDENT_NAME_SIZE - 1] = '\0';
    stu->number = number;
    memcpy(stu->name, name, STUDENT_NAME_SIZE);
    stu->chinese = chinese;
    stu->math = math;
    stu->english = english;
    return 1;
}

/*
 * 读取旧版 56 字节记录（姓名 32 字节），用于自动迁移历史数据文件。
 */
static int read_student_legacy(FILE *fp, Student *stu)
{
    if (!fp || !stu)
        return -1;

    uint64_t number;
    char name[LEGACY_STUDENT_NAME_SIZE];
    float chinese;
    float math;
    float english;
    uint32_t padding;

    if (fread(&number, sizeof(number), 1, fp) != 1)
        return feof(fp) ? 0 : -1;

    if (fread(name, sizeof(name), 1, fp) != 1 ||
        fread(&chinese, sizeof(chinese), 1, fp) != 1 ||
        fread(&math, sizeof(math), 1, fp) != 1 ||
        fread(&english, sizeof(english), 1, fp) != 1 ||
        fread(&padding, sizeof(padding), 1, fp) != 1)
    {
        return -1;
    }
    (void)padding;

    name[LEGACY_STUDENT_NAME_SIZE - 1] = '\0';
    memset(stu->name, 0, STUDENT_NAME_SIZE);
    stu->number = number;
    memcpy(stu->name, name, LEGACY_STUDENT_NAME_SIZE);
    stu->chinese = chinese;
    stu->math = math;
    stu->english = english;
    return 1;
}

static long get_file_size(FILE *fp)
{
    if (!fp)
        return -1;
    if (fseek(fp, 0, SEEK_END) != 0)
        return -1;
    long size = ftell(fp);
    if (size < 0)
        return -1;
    if (fseek(fp, 0, SEEK_SET) != 0)
        return -1;
    return size;
}

/* ------------------------------------------------------------------ *
 * 学生管理器
 * ------------------------------------------------------------------ */

StudentManager *student_manager_alloc(void)
{
    StudentManager *manager = (StudentManager *)calloc(1, sizeof(StudentManager));
    if (manager == NULL)
        return NULL;

    manager->flist = flist_alloc();
    if (manager->flist == NULL)
    {
        free(manager);
        return NULL;
    }

    manager->filename = DEFAULT_DATA_FILE;
    manager->isrunning = true;
    manager->loaded = false;
    return manager;
}

void student_manager_free(StudentManager *manager)
{
    if (manager == NULL)
        return;
    flist_free(manager->flist);
    free(manager);
}

void student_manager_run(StudentManager *manager)
{
    if (manager == NULL)
        return;

    if (student_manager_load(manager) != 0)
    {
        printf("数据加载失败，为避免覆盖原数据，系统将退出。\n");
        return;
    }

    while (manager->isrunning)
    {
        int option = student_manager_menu();

        if (option == Quit)
        {
            student_manager_quit(manager);
            break;
        }

        switch ((Option)option)
        {
        case Entry:
            student_manager_entry(manager);
            break;
        case Print:
            printf("打印学生信息\n");
            student_manager_print(manager);
            break;
        case Remove:
            printf("删除学生信息\n");
            student_manager_remove(manager);
            break;
        case Find:
            printf("查找学生信息\n");
            student_manager_find(manager);
            break;
        case Alter:
            printf("修改学生信息\n");
            student_manager_alter(manager);
            break;
        case Save:
            printf("保存学生信息\n");
            student_manager_save(manager);
            break;
        default:
            break;
        }

        wait_for_enter();
        clear_console();
    }

    if (student_manager_save(manager) != 0)
        printf("退出前保存失败，请检查 data 目录是否可写。\n");
}

int student_manager_menu(void)
{
    char line[64];

    while (true)
    {
        printf("==============================\n");
        printf("|    高校学生成绩管理系统    |\n");
        printf("==============================\n");
        printf("|          功能选择          |\n");
        printf("==============================\n");
        printf("|       1. 添加学生信息      |\n");
        printf("|       2. 打印学生信息      |\n");
        printf("|       3. 删除学生信息      |\n");
        printf("|       4. 查找学生信息      |\n");
        printf("|       5. 修改学生信息      |\n");
        printf("|       6. 保存学生信息      |\n");
        printf("|       0. 退出系统          |\n");
        printf("==============================\n");
        printf("请输入功能选项：");

        if (!read_line(line, sizeof(line)))
            return Quit;

        char *text = trim_in_place(line);
        if (*text == '\0')
        {
            printf("输入不能为空，请重新输入！\n\n");
            continue;
        }

        errno = 0;
        char *end = NULL;
        long option = strtol(text, &end, 10);
        if (end == text || errno == ERANGE)
        {
            printf("无效的选项，请重新输入！\n\n");
            continue;
        }
        while (*end && isspace((unsigned char)*end))
            end++;
        if (*end != '\0' || option < Quit || option > Save)
        {
            printf("无效的选项，请重新输入！\n\n");
            continue;
        }

        return (int)option;
    }
}

int student_manager_quit(StudentManager *manager)
{
    if (manager == NULL)
        return -1;
    manager->isrunning = false;
    printf("成功退出系统！\n");
    return 0;
}

// 添加学生信息
int student_manager_entry(StudentManager *manager)
{
    if (manager == NULL || !manager->loaded)
        return -1;

    uint64_t number;
    char name[STUDENT_NAME_SIZE];
    float chinese;
    float math;
    float english;

    if (!read_uint64("输入学生学号>", &number))
        return -1;
    if (flist_find(manager->flist, number) != NULL)
    {
        printf("该学号已存在，无法重复添加。\n");
        return -1;
    }
    if (!read_student_name("输入学生姓名>", name, sizeof(name)))
        return -1;
    if (!read_score("输入学生语文成绩>", &chinese))
        return -1;
    if (!read_score("输入学生数学成绩>", &math))
        return -1;
    if (!read_score("输入学生英语成绩>", &english))
        return -1;

    Student *stu = student_alloc2(number, name, chinese, math, english);
    if (stu == NULL)
    {
        printf("内存不足，添加失败。\n");
        return -1;
    }

    flist_push_back(manager->flist, stu);
    printf("添加成功！\n");
    return 0;
}

// 打印学生信息
int student_manager_print(StudentManager *manager)
{
    if (manager == NULL || !manager->loaded)
        return -1;
    if (flist_empty(manager->flist))
    {
        printf("暂无学生记录。\n");
        return 0;
    }
    flist_print(manager->flist, student_print);
    return 0;
}

// 删除学生信息
int student_manager_remove(StudentManager *manager)
{
    if (manager == NULL || !manager->loaded)
        return -1;

    uint64_t number;
    if (!read_uint64("请输入学生学号>", &number))
        return -1;

    Student *pstu = (Student *)flist_find(manager->flist, number);
    if (!pstu)
    {
        printf("未找到该学生\n");
        return -1;
    }

    Student temp = {0};
    temp.number = number;
    flist_remove(manager->flist, &temp, student_compare);
    printf("删除成功\n");
    return 0;
}

// 查找学生信息
int student_manager_find(StudentManager *manager)
{
    if (manager == NULL || !manager->loaded)
        return -1;

    uint64_t number;
    if (!read_uint64("请输入查找的学生学号>", &number))
        return -1;

    Student *pstu = (Student *)flist_find(manager->flist, number);
    if (!pstu)
    {
        printf("未找到该学生\n");
        return -1;
    }

    printf("%s", student_header());
    student_print(pstu);
    return 0;
}

// 修改学生信息
int student_manager_alter(StudentManager *manager)
{
    if (manager == NULL || !manager->loaded)
        return -1;

    uint64_t number;
    if (!read_uint64("请输入修改的学生学号>", &number))
        return -1;

    Student *pstu = (Student *)flist_find(manager->flist, number);
    if (!pstu)
    {
        printf("未找到该学生\n");
        return -1;
    }

    char line[256];
    printf("输入修改的姓名（直接回车保持不变）>");
    if (!read_line(line, sizeof(line)))
        return -1;

    char *name = trim_in_place(line);
    if (*name != '\0')
    {
        if (strlen(name) >= STUDENT_NAME_SIZE)
        {
            printf("姓名过长，最多 21 个汉字（或 63 个英文字母）。\n");
            return -1;
        }
        memcpy(pstu->name, name, strlen(name) + 1);
    }

    if (!read_score("输入修改的语文成绩>", &pstu->chinese))
        return -1;
    if (!read_score("输入修改的数学成绩>", &pstu->math))
        return -1;
    if (!read_score("输入修改的英语成绩>", &pstu->english))
        return -1;

    printf("数据修改成功！\n");
    return 0;
}

// 保存学生信息
int student_manager_save(StudentManager *manager)
{
    if (manager == NULL || manager->flist == NULL)
        return -1;
    if (!manager->loaded)
    {
        printf("数据尚未成功加载，已取消保存，避免覆盖原数据文件。\n");
        return -1;
    }

    FILE *fp = fopen(manager->filename, "wb");
    if (!fp)
    {
        perror("打开数据文件失败");
        return -1;
    }

    int result = 0;
    for (Node *cur_node = manager->flist->front; cur_node != NULL; cur_node = cur_node->next)
    {
        if (write_student(fp, (Student *)cur_node->data) != 0)
        {
            result = -1;
            break;
        }
    }

    if (result == 0 && fflush(fp) != 0)
        result = -1;
    if (fclose(fp) != 0)
        result = -1;

    if (result != 0)
    {
        perror("保存学生信息失败");
        return -1;
    }

    printf("学生信息保存成功（共 %d 条）。\n", manager->flist->size);
    return 0;
}

// 加载学生信息
int student_manager_load(StudentManager *manager)
{
    if (manager == NULL || manager->flist == NULL)
        return -1;

    manager->loaded = false;

    if (!file_exists(manager->filename))
    {
        if (ensure_data_directory() != 0)
            return -1;
        if (create_empty_data_file(manager->filename) != 0)
            return -1;
    }

    FILE *fp = fopen(manager->filename, "rb");
    if (!fp)
    {
        perror("打开数据文件失败");
        return -1;
    }

    long file_size = get_file_size(fp);
    if (file_size < 0)
    {
        fclose(fp);
        printf("无法读取数据文件大小：%s\n", manager->filename);
        return -1;
    }

    bool legacy = false;
    if (file_size > 0)
    {
        if (file_size % (long)STUDENT_RECORD_SIZE == 0)
        {
            legacy = false;
        }
        else if (file_size % (long)LEGACY_STUDENT_RECORD_SIZE == 0)
        {
            legacy = true;
        }
        else
        {
            fclose(fp);
            printf("数据文件大小不符合记录格式，已拒绝加载：%s\n", manager->filename);
            return -1;
        }
    }

    if (legacy)
        printf("检测到旧版 56 字节数据文件，读取后将在保存时转换为 88 字节新格式。\n");

    bool failed = false;
    while (true)
    {
        Student *temp_stu = student_alloc();
        if (temp_stu == NULL)
        {
            printf("内存不足，读取数据失败。\n");
            failed = true;
            break;
        }

        int status = legacy ? read_student_legacy(fp, temp_stu) : read_student(fp, temp_stu);
        if (status == 1)
        {
            flist_push_back(manager->flist, temp_stu);
        }
        else
        {
            student_free(temp_stu);
            if (status < 0)
                failed = true;
            break;
        }
    }

    if (ferror(fp))
        failed = true;
    if (fclose(fp) != 0)
        failed = true;

    if (failed)
    {
        printf("数据文件读取失败或格式不完整：%s\n", manager->filename);
        return -1;
    }

    manager->loaded = true;
    printf("成功加载 %d 条学生记录。\n", manager->flist->size);
    return 0;
}

bool file_exists(const char *filename)
{
    if (!filename)
        return false;

#ifdef _WIN32
    return _access(filename, 0) == 0;
#else
    struct stat st;
    return stat(filename, &st) == 0;
#endif
}
