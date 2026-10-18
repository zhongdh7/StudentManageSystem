#include <stdio.h>
#include "Student.h"
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>

Student *student_alloc(void)
{
    // calloc 将结构体中的姓名字段和填充字节全部清零，
    // 避免未初始化的垃圾数据被写入数据文件。
    Student *stu = (Student *)calloc(1, sizeof(Student));
    if (!stu)
        return NULL;
    return stu;
}

Student *student_alloc2(uint64_t number, const char *name, float chinese, float math, float english)
{
    if (!name)
        return NULL;

    Student *stu = student_alloc();
    if (!stu)
        return NULL;

    stu->number = number;
    strncpy(stu->name, name, STUDENT_NAME_SIZE - 1);
    stu->name[STUDENT_NAME_SIZE - 1] = '\0';
    stu->chinese = chinese;
    stu->math = math;
    stu->english = english;
    return stu;
}

void student_free(Student *stu)
{
    if (stu)
        free(stu);
}

void student_print(Student *stu)
{
    if (stu)
        printf("%llu\t%s\t%.1f\t%.1f\t%.1f\n", stu->number, stu->name, stu->chinese, stu->math, stu->english);
}

const char *student_header(void)
{
    return "学号\t姓名\t语文\t数学\t英语\n";
}

bool student_compare(Student *left, Student *right)
{
    if (!left || !right)
        return false;

    // 只按学号比较，避免同名学生导致删除错误对象。
    return left->number == right->number;
}
