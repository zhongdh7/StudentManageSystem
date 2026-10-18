#include <errno.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "ForwardList.h"
#include "Server.h"
#include "Student.h"
#include "StudentManager.h"

#ifdef _WIN32
#include <windows.h>
#endif

static void print_usage(const char *program)
{
    fprintf(stderr, "用法：\n");
    fprintf(stderr, "  %s                 启动控制台菜单\n", program);
    fprintf(stderr, "  %s server [端口]   启动 Web 后端服务（默认端口 %d）\n", program, SERVER_DEFAULT_PORT);
    fprintf(stderr, "  %s --help          显示本帮助\n", program);
}

static int parse_port(const char *text, int *port)
{
    errno = 0;
    char *end = NULL;
    long parsed = strtol(text, &end, 10);
    if (end == text || *end != '\0' || errno == ERANGE || parsed <= 0 || parsed > 65535)
        return -1;
    *port = (int)parsed;
    return 0;
}

int main(int argc, char *argv[])
{
#ifdef _WIN32
    // Set the console input/output code page to UTF-8
    SetConsoleCP(CP_UTF8);
    SetConsoleOutputCP(CP_UTF8);
#else
    // 浏览器提前关闭连接时避免 SIGPIPE 结束服务进程
    signal(SIGPIPE, SIG_IGN);
#endif

    if (argc >= 2 && strcmp(argv[1], "--help") == 0)
    {
        print_usage(argv[0]);
        return 0;
    }

    if (argc >= 2 && (strcmp(argv[1], "server") == 0 || strcmp(argv[1], "--server") == 0))
    {
        int port = SERVER_DEFAULT_PORT;
        if (argc >= 3 && parse_port(argv[2], &port) != 0)
        {
            fprintf(stderr, "端口格式不正确，应为 1–65535 之间的整数。\n");
            print_usage(argv[0]);
            return 1;
        }
        if (argc > 3)
        {
            fprintf(stderr, "参数过多。\n");
            print_usage(argv[0]);
            return 1;
        }
        return server_run(port);
    }

    if (argc > 1)
    {
        fprintf(stderr, "未知参数：%s\n", argv[1]);
        print_usage(argv[0]);
        return 1;
    }

    StudentManager *manager = student_manager_alloc();
    if (manager == NULL)
    {
        fprintf(stderr, "初始化学生管理系统失败：内存不足。\n");
        return 1;
    }

    student_manager_run(manager);

    student_manager_free(manager);
    return 0;
}
