#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "Student.h"
#include "ForwardList.h"
#include "StudentManager.h"
#ifdef _WIN32
#include <windows.h>
#endif

int main()
{
#ifdef _WIN32
    // Set the console output code page to UTF-8
    SetConsoleOutputCP(CP_UTF8);
#endif
    StudentManager *manager = student_manager_alloc();

    student_manager_run(manager);

    student_manager_free(manager);
    return 0;
}