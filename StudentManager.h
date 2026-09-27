#ifndef STUDENT_MANAGER_H
#define STUDENT_MANAGER_H
#include "ForwardList.h"
#include "Student.h"

typedef struct StudentManager
{
    ForwardList *flist;
}StudentManager;

// 创建学生管理器
StudentManager *student_manager_alloc();

// 释放学生管理器
void student_manager_free(StudentManager *manager);

// 执行学生管理器
void student_manager_run(StudentManager *);

#endif