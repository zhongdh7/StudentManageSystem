#include "StudentManager.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "ForwardList.h"
#include "Student.h"
#include <stdbool.h>
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
    manager->filename="./data/student.txt";
    manager->isrunning=true;
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
    
    student_manager_load(manager);
    while (manager->isrunning)
    {
        Option option = student_manager_menu();

        switch (option)
        {
        case Quit:
            printf("退出系统\n");
            student_manager_quit(manager);
            break;
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
            printf("无效的选项，请重新输入！\n");
        }

        system("pause");
        system("cls");
    }
    student_manager_save(manager);
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
    Option option = -1;
    printf("请输入功能选项：");
    scanf("%d", &option);
    return option;
}

int student_manager_quit(StudentManager *manager)
{
    manager->isrunning = false;
    printf("成功退出系统！\n");
    return 0;
}

// 添加学生信息
int student_manager_entry(StudentManager *manager)
{
    // 输入数据
    Student *stu = student_alloc();
    printf("输入学生学号>");
    scanf("%llu", &stu->number);
    printf("输入学生姓名>");
    scanf("%s", stu->name);
    printf("输入学生语文成绩>");
    scanf("%f", &stu->chinese);
    printf("输入学生数学成绩>");
    scanf("%f", &stu->math);
    printf("输入学生英语成绩>");
    scanf("%f", &stu->english);

    // 插入
    flist_push_back(manager->flist, stu);
    return 0;
}

// 打印学生信息
int student_manager_print(StudentManager *manager)
{
    flist_print(manager->flist, student_print);
    return 0;
}

// 删除学生信息
int student_manager_remove(StudentManager *manager)
{
    Student temp;
    printf("请输入学生学号>");
    scanf("%llu", &temp.number);

    Student *pstu = (Student *)flist_find(manager->flist, temp.number);
    if (!pstu)
    {
        printf("未找到该学生\n");
        return -1;
    }
    flist_remove(manager->flist, &temp, student_compare);
    printf("删除成功\n");
    return 0;
}

// 查找学生信息
int student_manager_find(StudentManager *manager)
{
    Student temp;
    printf("请输入查找的学生学号>");
    scanf("%llu", &temp.number);

    Student *pstu = (Student *)flist_find(manager->flist, temp.number);
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
    Student temp;
    printf("请输入修改的学生学号>");
    scanf("%llu", &temp.number);

    Student *pstu = (Student *)flist_find(manager->flist, temp.number);
    if (!pstu)
    {
        printf("未找到该学生\n");
        return -1;
    }
    else
    {
        printf("输入修改的语文成绩>");
        scanf("%f", &pstu->chinese);
        printf("输入修改的数学成绩>");
        scanf("%f", &pstu->math);
        printf("输入修改的英语成绩>");
        scanf("%f", &pstu->english);
    }
    printf("数据修改成功！\n");
    return 0;
}

// 保存学生信息
int student_manager_save(StudentManager *manager)
{
    FILE* fp=fopen(manager->filename,"wb");
    if(!fp)
    {
        perror("open error");
        return -1;
    }
    for(Node*cur_node=manager->flist->front;cur_node!=NULL;cur_node=cur_node->next)
    {
        Student* stu=(Student*)cur_node->data;
        fwrite(stu,sizeof(Student),1,fp);
    }
    fclose(fp);
    return 0;
}

// 加载学生信息
int student_manager_load(StudentManager *manager)
{
    if(file_exists(manager->filename)==false)
    {
        system("mkdir data");
        system("touch ./data/student.txt");
    }
    FILE* fp=fopen(manager->filename,"rb");
    if(!fp)
    {
        perror("open error");
        return -1;
    }
    Student* temp_stu=student_alloc();
    while(fread(temp_stu,sizeof(Student),1,fp)==1)
    {
        flist_push_back(manager->flist,temp_stu);
        temp_stu=student_alloc();
    }
    fclose(fp);
    student_free(temp_stu);
    return 0;
}

bool file_exists(const char* filename)
{
    FILE*fp=fopen(filename,"rb");
    if(fp!=NULL)
    {
        return true;
    }
    return false;
}
