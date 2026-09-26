#include <stdio.h>
#include "Student.h"
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>


Student* student_alloc()
{
    Student* stu=(Student*)malloc(sizeof(Student));
    if(!stu)
        return NULL;
    return stu;
}

Student* student_alloc2(uint64_t number,const char*name,float chinese,float math,float english)
{
    Student* stu=student_alloc();
    if(!stu)
        return NULL;
    stu->number=number;
    strcpy(stu->name,name);
    stu->chinese=chinese;
    stu->math=math;
    stu->english=english;
    return stu;
}

void student_free(Student*stu)
{
    if(stu)
        free(stu);
}

void student_print(Student*stu)
{
    if(stu)
        printf("%llu\t%s\t%.1f\t%.1f\t%.1f\n",stu->number,stu->name,stu->chinese,stu->math,stu->english);
}

const char* student_header()
{
    return "学号\t姓名\t语文\t数学\t英语\n";
}

bool student_compare(Student* left,Student* right)
{
    if(left->number==right->number)
    {
        return true;
    }
    else if(!strcmp(left->name,right->name))
    {
        return true;
    }
}
