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

    
    ForwardList* flist=flist_alloc();
    flist_push_front(flist,student_alloc2(1002,"赵日天",59.5,62,86));
    flist_push_front(flist,student_alloc2(1003,"李四",59.5,69,36));
    flist_push_front(flist,student_alloc2(1004,"王五",59.5,62,86));


    flist_push_back(flist,student_alloc2(1005,"赵六",59.5,62,86));
    flist_push_back(flist,student_alloc2(1006,"赵七",67.8,62,26));
    flist_push_back(flist,student_alloc2(1007,"赵八",59.5,62,86));
    Node* current=flist->front;
    while(current)
    {
        student_print((Student*)current->data);
        current=current->next;
    }

    flist_free(flist);

    return 0;
}