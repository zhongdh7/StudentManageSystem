#ifndef STUDENT_MANAGER_H
#define STUDENT_MANAGER_H
#include "ForwardList.h"
#include "Student.h"

typedef struct StudentManager
{
    ForwardList *flist;
} StudentManager;

// 创建学生管理器
StudentManager *student_manager_alloc();

// 释放学生管理器
void student_manager_free(StudentManager *manager);

// 执行学生管理器
void student_manager_run(StudentManager *);

// 菜单
int student_manager_menu();

// 退出
int student_manager_quit(StudentManager *manager);

// 添加学生信息
int student_manager_entry(StudentManager *manager);

// 打印学生信息
int student_manager_print(StudentManager *manager);

// 删除学生信息
int student_manager_remove(StudentManager *manager);

// 查找学生信息
int student_manager_find(StudentManager *manager);

// 修改学生信息
int student_manager_alter(StudentManager *manager);

// 保存学生信息
int student_manager_save(StudentManager *manager);

// 加载学生信息
int student_manager_load(StudentManager *manager);

#endif