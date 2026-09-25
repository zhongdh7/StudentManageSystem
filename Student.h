#ifndef STUDENT_H
#define STUDENT_H
#include <stdint.h>

// 学生结构
typedef struct Student
{
    uint64_t number; // 学号
    char name[32];
    float chinese;
    float math;
    float english;
} Student;

// 在堆区创建一个空的学生
Student* student_alloc();

// 有初始化的学生创建函数
Student* student_alloc2(uint64_t,const char*name,
                        float chinese,float math,float english);

// 打印学生信息
void student_print(Student*stu);

// 获取学生信息头
const char* student_header();

// 释放学生内存
void student_free(Student*stu);
#endif