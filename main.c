#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "Student.h"
#include "ForwardList.h"
#ifdef _WIN32
#include <windows.h>
#endif

int main()
{
#ifdef _WIN32
    // Set the console output code page to UTF-8
    SetConsoleOutputCP(CP_UTF8);
#endif
    // Student maye={1001,"maye",59.5,62,86};
    // printf("%s",student_header());
    // student_print(&maye);

    Student*stu=student_alloc2(1002,"赵日天",59.5,62,86);
    if(stu==NULL)
    {
        printf("内存分配失败");
        return 0;
    }


    Node* node=node_alloc(stu);
    student_print((Student*)node->data);
    student_free(stu);
    node_free(node);
    
    ForwardList* flist=flist_alloc();

    flist_free(flist);

    return 0;
}