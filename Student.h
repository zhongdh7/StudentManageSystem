#ifndef STUDENT_H
#define STUDENT_H
#include <stdint.h>
#include <stdbool.h>

// 姓名字段容量（包含结尾 '\0'）
#define STUDENT_NAME_SIZE 64

// 学生结构
typedef struct Student
{
    uint64_t number; // 学号
    char name[STUDENT_NAME_SIZE];
    float chinese;
    float math;
    float english;
} Student;

// 在堆区创建一个空的学生
Student *student_alloc(void);

// 有初始化的学生创建函数
Student *student_alloc2(uint64_t, const char *name,
                        float chinese, float math, float english);

// 打印学生信息
void student_print(Student *stu);

// 获取学生信息头
const char *student_header(void);

// 释放学生内存
void student_free(Student *stu);

// 比较学生数据（仅按学号）
bool student_compare(Student *left, Student *right);
#endif