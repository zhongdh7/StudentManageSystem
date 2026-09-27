#include "StudentManager.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "ForwardList.h"
#include "Student.h"


StudentManager *student_manager_alloc()
{
    StudentManager *manager=(StudentManager*)malloc(sizeof(StudentManager));
    if(manager==NULL)
    {
        return NULL;
    }
    manager->flist=flist_alloc();
    return manager;
}

void student_manager_free(StudentManager *manager)
{
    if(manager==NULL)
        return ;
    flist_free(manager->flist);
    free(manager);
}

void student_manager_run(StudentManager * manager)
{

}
