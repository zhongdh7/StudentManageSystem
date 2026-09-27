#include "StudentManager.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "ForwardList.h"
#include "Student.h"
#include "stdbool.h"
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

StudentManager *student_manager_alloc()
{
    StudentManager *manager = (StudentManager *)malloc(sizeof(StudentManager));
    if (manager == NULL)
    {
        return NULL;
    }
    manager->flist = flist_alloc();
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
    while (true)
    {
        Option option = student_manager_menu();

        switch (option)
        {
        case Quit:
            printf("退出系统\n");
            return;
        case Entry:
            printf("添加学生信息\n");
            break;
        case Print:
            printf("打印学生信息\n");
            flist_print(manager->flist, student_print);
            break;
        case Remove:
            printf("删除学生信息\n");
            break;
        case Find:
            printf("查找学生信息\n");
            break;
        case Alter:
            printf("修改学生信息\n");
            break;
        case Save:
            printf("保存学生信息\n");
            break;
        default:
            printf("无效的选项，请重新输入！\n");
        }

        system("pause");
        system("cls");
    }
}

int student_manager_menu()
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
    Option option;
    printf("请输入功能选项：");
    scanf("%d", &option);
    return option;
}
