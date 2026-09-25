#include <stdio.h>
#include "Student.h"
#ifdef _WIN32
#include <windows.h>
#endif

int main()
{
#ifdef _WIN32
    // Set the console output code page to UTF-8
    SetConsoleOutputCP(CP_UTF8);
#endif

    return 0;
}