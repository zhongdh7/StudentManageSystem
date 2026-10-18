/*
 * 学生成绩管理系统 · C 后端 HTTP 服务
 * ------------------------------------------------------------------
 * 复用 Student / ForwardList / StudentManager 的数据结构与文件读写，
 * 向 Web 前端提供 REST API，并同时托管 web/ 目录中的静态页面。
 *
 * 本文件不包含 main 函数：由 main.c 在 server 模式下调用 server_run()。
 * 编译与运行方式见 README.md。
 */
#include <ctype.h>
#include <errno.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "ForwardList.h"
#include "Server.h"
#include "Student.h"
#include "StudentManager.h"

#ifdef _WIN32
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
typedef SOCKET socket_handle_t;
#define INVALID_SOCKET_HANDLE INVALID_SOCKET
#define close_socket closesocket
#else
#include <arpa/inet.h>
#include <netinet/in.h>
#include <signal.h>
#include <sys/socket.h>
#include <unistd.h>
typedef int socket_handle_t;
#define INVALID_SOCKET_HANDLE (-1)
#define close_socket close
#endif

#define MAX_REQUEST_SIZE (1024 * 1024)
#define WEB_ROOT "web"
#define API_PREFIX "/api/"

static time_t last_saved_at = 0;

typedef struct
{
    uint64_t number;
    char name[STUDENT_NAME_SIZE];
    float chinese;
    float math;
    float english;
} StudentInput;

/* ------------------------------------------------------------------ *
 * Socket 辅助
 * ------------------------------------------------------------------ */

static int socket_send_all(socket_handle_t client, const char *data, size_t length)
{
    size_t sent = 0;
    while (sent < length)
    {
        int chunk = send(client, data + sent, (int)(length - sent), 0);
        if (chunk <= 0)
            return -1;
        sent += (size_t)chunk;
    }
    return 0;
}

static void set_receive_timeout(socket_handle_t client)
{
#ifdef _WIN32
    DWORD timeout = 5000;
    setsockopt(client, SOL_SOCKET, SO_RCVTIMEO, (const char *)&timeout, sizeof(timeout));
#else
    struct timeval timeout;
    timeout.tv_sec = 5;
    timeout.tv_usec = 0;
    setsockopt(client, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
#endif
}

static bool ascii_equal_ignore_case(const char *left, const char *right, size_t length)
{
    for (size_t i = 0; i < length; i++)
    {
        if (tolower((unsigned char)left[i]) != tolower((unsigned char)right[i]))
            return false;
    }
    return true;
}

static const char *find_header_value(const char *raw, const char *header_name)
{
    size_t name_length = strlen(header_name);
    const char *line = strstr(raw, "\r\n");
    if (!line)
        return NULL;
    line += 2;

    while (*line && strncmp(line, "\r\n", 2) != 0)
    {
        const char *line_end = strstr(line, "\r\n");
        if (!line_end)
            break;
        size_t line_length = (size_t)(line_end - line);
        if (line_length > name_length && ascii_equal_ignore_case(line, header_name, name_length) &&
            line[name_length] == ':')
        {
            const char *value = line + name_length + 1;
            while (*value == ' ' || *value == '\t')
                value++;
            return value;
        }
        line = line_end + 2;
    }
    return NULL;
}

static bool parse_content_length(const char *raw, size_t *content_length)
{
    const char *value = find_header_value(raw, "Content-Length");
    if (!value || !isdigit((unsigned char)*value))
    {
        *content_length = 0;
        return true;
    }

    errno = 0;
    char *end = NULL;
    unsigned long long parsed = strtoull(value, &end, 10);
    if (end == value || errno == ERANGE)
        return false;
    *content_length = (size_t)parsed;
    return true;
}

/* ------------------------------------------------------------------ *
 * HTTP 响应
 * ------------------------------------------------------------------ */

static void send_response(socket_handle_t client, int status, const char *reason,
                          const char *content_type, const char *body, size_t body_length)
{
    char header[512];
    int header_length = snprintf(header, sizeof(header),
                                 "HTTP/1.1 %d %s\r\n"
                                 "Content-Type: %s\r\n"
                                 "Content-Length: %zu\r\n"
                                 "Cache-Control: no-store\r\n"
                                 "Connection: close\r\n"
                                 "\r\n",
                                 status, reason, content_type, body_length);
    if (header_length < 0)
        return;
    if (socket_send_all(client, header, (size_t)header_length) != 0)
        return;
    if (body_length > 0)
        socket_send_all(client, body, body_length);
}

static void send_json(socket_handle_t client, int status, const char *reason, const char *json)
{
    send_response(client, status, reason, "application/json; charset=utf-8", json, strlen(json));
}

static void json_escape(const char *input, char *output, size_t capacity)
{
    size_t out = 0;
    if (capacity == 0)
        return;

    for (const unsigned char *p = (const unsigned char *)input; *p && out + 1 < capacity; p++)
    {
        unsigned char ch = *p;
        if (ch == '"' || ch == '\\')
        {
            if (out + 2 >= capacity)
                break;
            output[out++] = '\\';
            output[out++] = (char)ch;
        }
        else if (ch == '\n' || ch == '\r' || ch == '\t' || ch == '\b' || ch == '\f')
        {
            if (out + 2 >= capacity)
                break;
            output[out++] = '\\';
            output[out++] = ch == '\n' ? 'n' : ch == '\r' ? 'r' : ch == '\t' ? 't' : ch == '\b' ? 'b' : 'f';
        }
        else if (ch < 0x20)
        {
            if (out + 6 >= capacity)
                break;
            snprintf(output + out, capacity - out, "\\u%04x", ch);
            out += 6;
        }
        else
        {
            output[out++] = (char)ch;
        }
    }
    output[out] = '\0';
}

static void send_error_json(socket_handle_t client, int status, const char *reason, const char *message)
{
    char escaped[512];
    char body[768];
    json_escape(message, escaped, sizeof(escaped));
    snprintf(body, sizeof(body), "{\"ok\":false,\"error\":\"%s\"}", escaped);
    send_json(client, status, reason, body);
}

/* ------------------------------------------------------------------ *
 * JSON 请求解析
 * ------------------------------------------------------------------ */

static const char *json_find_value(const char *json, const char *key)
{
    char pattern[64];
    snprintf(pattern, sizeof(pattern), "\"%s\"", key);

    const char *position = strstr(json, pattern);
    if (!position)
        return NULL;
    position += strlen(pattern);
    while (*position == ' ' || *position == '\t' || *position == '\r' || *position == '\n')
        position++;
    if (*position != ':')
        return NULL;
    position++;
    while (*position == ' ' || *position == '\t' || *position == '\r' || *position == '\n')
        position++;
    return position;
}

static int utf8_append(char *output, size_t capacity, size_t *length, unsigned int codepoint)
{
    if (codepoint <= 0x7F)
    {
        if (*length + 1 >= capacity)
            return -1;
        output[(*length)++] = (char)codepoint;
    }
    else if (codepoint <= 0x7FF)
    {
        if (*length + 2 >= capacity)
            return -1;
        output[(*length)++] = (char)(0xC0 | (codepoint >> 6));
        output[(*length)++] = (char)(0x80 | (codepoint & 0x3F));
    }
    else
    {
        if (*length + 3 >= capacity)
            return -1;
        output[(*length)++] = (char)(0xE0 | (codepoint >> 12));
        output[(*length)++] = (char)(0x80 | ((codepoint >> 6) & 0x3F));
        output[(*length)++] = (char)(0x80 | (codepoint & 0x3F));
    }
    return 0;
}

static int json_parse_string(const char *position, char *output, size_t capacity)
{
    if (!position || *position != '"')
        return -1;

    position++;
    size_t length = 0;
    while (*position != '"')
    {
        if (*position == '\0')
            return -1;

        if (*position == '\\')
        {
            position++;
            if (*position == '\0')
                return -1;

            unsigned int codepoint = 0;
            switch (*position)
            {
            case '"':
                codepoint = '"';
                break;
            case '\\':
                codepoint = '\\';
                break;
            case '/':
                codepoint = '/';
                break;
            case 'b':
                codepoint = '\b';
                break;
            case 'f':
                codepoint = '\f';
                break;
            case 'n':
                codepoint = '\n';
                break;
            case 'r':
                codepoint = '\r';
                break;
            case 't':
                codepoint = '\t';
                break;
            case 'u':
            {
                char hex[5] = {0};
                if (strlen(position + 1) < 4)
                    return -1;
                memcpy(hex, position + 1, 4);
                char *end = NULL;
                codepoint = (unsigned int)strtoul(hex, &end, 16);
                if (end != hex + 4)
                    return -1;
                position += 4;
                break;
            }
            default:
                return -1;
            }
            if (utf8_append(output, capacity, &length, codepoint) != 0)
                return -1;
            position++;
        }
        else
        {
            if (length + 1 >= capacity)
                return -1;
            output[length++] = *position++;
        }
    }

    output[length] = '\0';
    return 0;
}

static int json_get_string(const char *json, const char *key, char *output, size_t capacity)
{
    const char *position = json_find_value(json, key);
    if (!position)
        return -1;
    return json_parse_string(position, output, capacity);
}

static int json_get_uint64(const char *json, const char *key, uint64_t *value)
{
    const char *position = json_find_value(json, key);
    if (!position)
        return -1;

    char number_text[32];
    if (*position == '"')
    {
        if (json_parse_string(position, number_text, sizeof(number_text)) != 0)
            return -1;
    }
    else
    {
        size_t length = 0;
        while (isdigit((unsigned char)position[length]))
        {
            if (length + 1 >= sizeof(number_text))
                return -1;
            number_text[length] = position[length];
            length++;
        }
        number_text[length] = '\0';
    }

    if (number_text[0] == '\0')
        return -1;

    errno = 0;
    char *end = NULL;
    unsigned long long parsed = strtoull(number_text, &end, 10);
    if (end == number_text || *end != '\0' || errno == ERANGE)
        return -1;

    *value = (uint64_t)parsed;
    return 0;
}

static int json_get_double(const char *json, const char *key, double *value)
{
    const char *position = json_find_value(json, key);
    if (!position)
        return -1;

    char number_text[64];
    bool quoted = (*position == '"');
    if (quoted)
    {
        if (json_parse_string(position, number_text, sizeof(number_text)) != 0)
            return -1;
        position = number_text;
    }

    errno = 0;
    char *end = NULL;
    double parsed = strtod(position, &end);
    if (end == position || errno == ERANGE)
        return -1;
    if (quoted)
    {
        while (*end && isspace((unsigned char)*end))
            end++;
        if (*end != '\0')
            return -1;
    }

    *value = parsed;
    return 0;
}

static int parse_student_input(const char *body, StudentInput *input, char *error, size_t error_size)
{
    memset(input, 0, sizeof(*input));

    if (json_get_uint64(body, "number", &input->number) != 0)
    {
        snprintf(error, error_size, "学号缺失或格式不正确");
        return -1;
    }
    if (json_get_string(body, "name", input->name, sizeof(input->name)) != 0 || input->name[0] == '\0')
    {
        snprintf(error, error_size, "姓名缺失或格式不正确");
        return -1;
    }
    if (strlen(input->name) >= STUDENT_NAME_SIZE)
    {
        snprintf(error, error_size, "姓名过长，最多 63 个字节");
        return -1;
    }

    double chinese = 0;
    double math = 0;
    double english = 0;
    if (json_get_double(body, "chinese", &chinese) != 0 ||
        json_get_double(body, "math", &math) != 0 ||
        json_get_double(body, "english", &english) != 0)
    {
        snprintf(error, error_size, "成绩缺失或格式不正确");
        return -1;
    }
    if (!(chinese >= 0 && chinese <= 100) || !(math >= 0 && math <= 100) ||
        !(english >= 0 && english <= 100))
    {
        snprintf(error, error_size, "成绩需在 0–100 之间");
        return -1;
    }

    input->chinese = (float)chinese;
    input->math = (float)math;
    input->english = (float)english;
    return 0;
}

/* ------------------------------------------------------------------ *
 * API 响应与业务
 * ------------------------------------------------------------------ */

static void student_to_json(const Student *student, char *output, size_t capacity)
{
    char escaped_name[512];
    json_escape(student->name, escaped_name, sizeof(escaped_name));
    snprintf(output, capacity,
             "{\"number\":\"%llu\",\"name\":\"%s\",\"chinese\":%.1f,\"math\":%.1f,\"english\":%.1f}",
             (unsigned long long)student->number, escaped_name,
             student->chinese, student->math, student->english);
}

static void send_students_json(socket_handle_t client, StudentManager *manager)
{
    size_t count = (size_t)manager->flist->size;
    size_t capacity = 256 + count * 640;
    char *buffer = (char *)malloc(capacity);
    if (!buffer)
    {
        send_error_json(client, 500, "Internal Server Error", "内存不足");
        return;
    }

    size_t offset = 0;
    offset += (size_t)snprintf(buffer + offset, capacity - offset, "{\"ok\":true,\"mode\":\"c-backend\",\"students\":[");

    bool first = true;
    for (Node *node = manager->flist->front; node != NULL; node = node->next)
    {
        char student_json[640];
        student_to_json((const Student *)node->data, student_json, sizeof(student_json));
        if (!first)
            offset += (size_t)snprintf(buffer + offset, capacity - offset, ",");
        offset += (size_t)snprintf(buffer + offset, capacity - offset, "%s", student_json);
        first = false;
    }

    offset += (size_t)snprintf(buffer + offset, capacity - offset,
                               "],\"savedAt\":%lld}",
                               (long long)last_saved_at * 1000);
    send_json(client, 200, "OK", buffer);
    free(buffer);
}

static void send_student_json(socket_handle_t client, int status, const char *reason, const Student *student)
{
    char student_json[640];
    char response[768];
    student_to_json(student, student_json, sizeof(student_json));
    snprintf(response, sizeof(response), "{\"ok\":true,\"student\":%s}", student_json);
    send_json(client, status, reason, response);
}

static int save_or_error(socket_handle_t client, StudentManager *manager)
{
    if (student_manager_save(manager) != 0)
    {
        send_error_json(client, 500, "Internal Server Error", "保存数据文件失败");
        return -1;
    }
    last_saved_at = time(NULL);
    return 0;
}

static void handle_create_student(socket_handle_t client, StudentManager *manager,
                                  const char *body, size_t body_length)
{
    char body_copy[4096];
    if (body_length >= sizeof(body_copy))
    {
        send_error_json(client, 400, "Bad Request", "请求内容过大");
        return;
    }
    memcpy(body_copy, body, body_length);
    body_copy[body_length] = '\0';

    StudentInput input;
    char error[256];
    if (parse_student_input(body_copy, &input, error, sizeof(error)) != 0)
    {
        send_error_json(client, 400, "Bad Request", error);
        return;
    }

    if (flist_find(manager->flist, input.number) != NULL)
    {
        send_error_json(client, 409, "Conflict", "该学号已存在");
        return;
    }

    Student *student = student_alloc2(input.number, input.name, input.chinese, input.math, input.english);
    if (!student)
    {
        send_error_json(client, 500, "Internal Server Error", "内存不足");
        return;
    }

    flist_push_back(manager->flist, student);
    if (save_or_error(client, manager) != 0)
        return;
    send_student_json(client, 201, "Created", student);
}

static void handle_update_student(socket_handle_t client, StudentManager *manager,
                                  uint64_t original_number, const char *body, size_t body_length)
{
    char body_copy[4096];
    if (body_length >= sizeof(body_copy))
    {
        send_error_json(client, 400, "Bad Request", "请求内容过大");
        return;
    }
    memcpy(body_copy, body, body_length);
    body_copy[body_length] = '\0';

    Student *student = (Student *)flist_find(manager->flist, original_number);
    if (!student)
    {
        send_error_json(client, 404, "Not Found", "未找到该学生");
        return;
    }

    StudentInput input;
    char error[256];
    if (parse_student_input(body_copy, &input, error, sizeof(error)) != 0)
    {
        send_error_json(client, 400, "Bad Request", error);
        return;
    }

    if (input.number != original_number &&
        flist_find(manager->flist, input.number) != NULL)
    {
        send_error_json(client, 409, "Conflict", "修改后的学号已存在");
        return;
    }

    student->number = input.number;
    memset(student->name, 0, sizeof(student->name));
    memcpy(student->name, input.name, strlen(input.name) + 1);
    student->chinese = input.chinese;
    student->math = input.math;
    student->english = input.english;

    if (save_or_error(client, manager) != 0)
        return;
    send_student_json(client, 200, "OK", student);
}

static void handle_delete_student(socket_handle_t client, StudentManager *manager, uint64_t number)
{
    if (flist_find(manager->flist, number) == NULL)
    {
        send_error_json(client, 404, "Not Found", "未找到该学生");
        return;
    }

    Student target = {0};
    target.number = number;
    flist_remove(manager->flist, &target, student_compare);

    if (save_or_error(client, manager) != 0)
        return;
    send_json(client, 200, "OK", "{\"ok\":true}");
}

static void handle_clear_students(socket_handle_t client, StudentManager *manager)
{
    while (!flist_empty(manager->flist))
        flist_remove_front(manager->flist);

    if (save_or_error(client, manager) != 0)
        return;
    send_json(client, 200, "OK", "{\"ok\":true}");
}

static int parse_path_number(const char *path, uint64_t *number)
{
    const char *id = path + strlen("/api/students/");
    if (*id == '\0')
        return -1;

    errno = 0;
    char *end = NULL;
    unsigned long long parsed = strtoull(id, &end, 10);
    if (end == id || *end != '\0' || errno == ERANGE)
        return -1;

    *number = (uint64_t)parsed;
    return 0;
}

static void handle_api_request(socket_handle_t client, StudentManager *manager,
                               const char *method, const char *path,
                               const char *body, size_t body_length)
{
    if (strcmp(path, "/api/health") == 0)
    {
        if (strcmp(method, "GET") != 0)
        {
            send_error_json(client, 405, "Method Not Allowed", "只支持 GET");
            return;
        }
        char response[128];
        snprintf(response, sizeof(response), "{\"ok\":true,\"mode\":\"c-backend\",\"records\":%d}",
                 manager->flist->size);
        send_json(client, 200, "OK", response);
        return;
    }

    if (strcmp(path, "/api/students") == 0)
    {
        if (strcmp(method, "GET") == 0)
        {
            send_students_json(client, manager);
            return;
        }
        if (strcmp(method, "POST") == 0)
        {
            handle_create_student(client, manager, body, body_length);
            return;
        }
        if (strcmp(method, "DELETE") == 0)
        {
            handle_clear_students(client, manager);
            return;
        }
        send_error_json(client, 405, "Method Not Allowed", "不支持该请求方法");
        return;
    }

    if (strncmp(path, "/api/students/", strlen("/api/students/")) == 0)
    {
        uint64_t number = 0;
        if (parse_path_number(path, &number) != 0)
        {
            send_error_json(client, 400, "Bad Request", "学号格式不正确");
            return;
        }

        if (strcmp(method, "PUT") == 0)
        {
            handle_update_student(client, manager, number, body, body_length);
            return;
        }
        if (strcmp(method, "DELETE") == 0)
        {
            handle_delete_student(client, manager, number);
            return;
        }
        send_error_json(client, 405, "Method Not Allowed", "不支持该请求方法");
        return;
    }

    send_error_json(client, 404, "Not Found", "接口不存在");
}

/* ------------------------------------------------------------------ *
 * 静态文件
 * ------------------------------------------------------------------ */

static const char *content_type_for(const char *path)
{
    const char *extension = strrchr(path, '.');
    if (!extension)
        return "application/octet-stream";
    if (strcmp(extension, ".html") == 0)
        return "text/html; charset=utf-8";
    if (strcmp(extension, ".css") == 0)
        return "text/css; charset=utf-8";
    if (strcmp(extension, ".js") == 0)
        return "text/javascript; charset=utf-8";
    if (strcmp(extension, ".json") == 0)
        return "application/json; charset=utf-8";
    if (strcmp(extension, ".svg") == 0)
        return "image/svg+xml";
    if (strcmp(extension, ".png") == 0)
        return "image/png";
    if (strcmp(extension, ".ico") == 0)
        return "image/x-icon";
    if (strcmp(extension, ".txt") == 0)
        return "text/plain; charset=utf-8";
    return "application/octet-stream";
}

static void serve_static_file(socket_handle_t client, const char *path, const char *method)
{
    if (strcmp(method, "GET") != 0)
    {
        send_error_json(client, 405, "Method Not Allowed", "只支持 GET");
        return;
    }

    char relative[1024];
    if (path[0] == '\0' || strcmp(path, "/") == 0)
    {
        snprintf(relative, sizeof(relative), "index.html");
    }
    else
    {
        if (path[0] != '/')
        {
            send_error_json(client, 400, "Bad Request", "路径格式不正确");
            return;
        }
        snprintf(relative, sizeof(relative), "%s", path + 1);
    }

    if (strstr(relative, "..") != NULL)
    {
        send_error_json(client, 403, "Forbidden", "禁止访问该路径");
        return;
    }

    char filename[1200];
    snprintf(filename, sizeof(filename), "%s/%s", WEB_ROOT, relative);

    FILE *file = fopen(filename, "rb");
    if (!file)
    {
        send_error_json(client, 404, "Not Found", "文件不存在");
        return;
    }

    if (fseek(file, 0, SEEK_END) != 0)
    {
        fclose(file);
        send_error_json(client, 500, "Internal Server Error", "读取文件失败");
        return;
    }
    long size = ftell(file);
    if (size < 0)
    {
        fclose(file);
        send_error_json(client, 500, "Internal Server Error", "读取文件失败");
        return;
    }
    rewind(file);

    char *content = (char *)malloc((size_t)size + 1);
    if (!content)
    {
        fclose(file);
        send_error_json(client, 500, "Internal Server Error", "内存不足");
        return;
    }
    if (size > 0 && fread(content, 1, (size_t)size, file) != (size_t)size)
    {
        free(content);
        fclose(file);
        send_error_json(client, 500, "Internal Server Error", "读取文件失败");
        return;
    }
    content[size] = '\0';
    fclose(file);

    // 在入口页注入后端标记，前端据此使用 /api 实时数据而不是本地存储
    if (strcmp(relative, "index.html") == 0)
    {
        const char *injection = "<script>window.__SMS_BACKEND__='c';</script>";
        char *head_end = strstr(content, "</head>");
        if (head_end)
        {
            size_t prefix_length = (size_t)(head_end - content);
            size_t injection_length = strlen(injection);
            char *injected = (char *)malloc((size_t)size + injection_length + 1);
            if (injected)
            {
                memcpy(injected, content, prefix_length);
                memcpy(injected + prefix_length, injection, injection_length);
                memcpy(injected + prefix_length + injection_length, head_end,
                       (size_t)size - prefix_length);
                injected[(size_t)size + injection_length] = '\0';
                free(content);
                content = injected;
                size += (long)injection_length;
            }
        }
    }

    send_response(client, 200, "OK", content_type_for(filename), content, (size_t)size);
    free(content);
}

/* ------------------------------------------------------------------ *
 * 请求处理
 * ------------------------------------------------------------------ */

static void handle_client(socket_handle_t client, StudentManager *manager)
{
    set_receive_timeout(client);

    char *raw = (char *)malloc(MAX_REQUEST_SIZE + 1);
    if (!raw)
    {
        send_error_json(client, 500, "Internal Server Error", "内存不足");
        return;
    }

    size_t total = 0;
    size_t body_offset = 0;
    size_t content_length = 0;
    bool headers_done = false;

    while (true)
    {
        int received = recv(client, raw + total, (int)(MAX_REQUEST_SIZE - total), 0);
        if (received <= 0)
            break;
        total += (size_t)received;
        raw[total] = '\0';

        if (!headers_done)
        {
            char *header_end = strstr(raw, "\r\n\r\n");
            if (header_end)
            {
                headers_done = true;
                body_offset = (size_t)(header_end - raw) + 4;
                if (!parse_content_length(raw, &content_length) ||
                    content_length > MAX_REQUEST_SIZE - body_offset)
                {
                    send_error_json(client, 400, "Bad Request", "请求头或长度不正确");
                    free(raw);
                    return;
                }
            }
        }

        if (headers_done && total >= body_offset + content_length)
            break;

        if (total >= MAX_REQUEST_SIZE)
            break;
    }

    if (!headers_done || total < body_offset + content_length)
    {
        send_error_json(client, 400, "Bad Request", "请求不完整或过大");
        free(raw);
        return;
    }

    char method[8] = {0};
    char path[1024] = {0};
    char *line_end = strstr(raw, "\r\n");
    if (!line_end)
    {
        send_error_json(client, 400, "Bad Request", "请求行不正确");
        free(raw);
        return;
    }
    *line_end = '\0';
    if (sscanf(raw, "%7s %1023s", method, path) != 2)
    {
        send_error_json(client, 400, "Bad Request", "请求行不正确");
        free(raw);
        return;
    }
    *line_end = '\r';

    char *query = strchr(path, '?');
    if (query)
        *query = '\0';

    const char *body = raw + body_offset;

    if (strncmp(path, API_PREFIX, strlen(API_PREFIX)) == 0)
    {
        handle_api_request(client, manager, method, path, body, content_length);
    }
    else if (strcmp(method, "GET") == 0)
    {
        serve_static_file(client, path, method);
    }
    else
    {
        send_error_json(client, 405, "Method Not Allowed", "只支持 GET");
    }

    free(raw);
}

/* ------------------------------------------------------------------ *
 * 服务入口（由 main.c 的 main 在 server 模式下调用）
 * ------------------------------------------------------------------ */

int server_run(int port)
{
    if (port <= 0 || port > 65535)
        port = SERVER_DEFAULT_PORT;

    StudentManager *manager = student_manager_alloc();
    if (!manager)
    {
        fprintf(stderr, "初始化学生管理器失败：内存不足。\n");
        return 1;
    }

    if (student_manager_load(manager) != 0)
    {
        fprintf(stderr, "数据加载失败，服务未启动。\n");
        student_manager_free(manager);
        return 1;
    }

    // 启动时保存一次，确保旧版数据文件转换为新的 88 字节格式
    if (student_manager_save(manager) != 0)
        fprintf(stderr, "警告：启动时保存数据文件失败，后续修改可能会失败。\n");
    else
        last_saved_at = time(NULL);

#ifdef _WIN32
    WSADATA wsa_data;
    if (WSAStartup(MAKEWORD(2, 2), &wsa_data) != 0)
    {
        fprintf(stderr, "Winsock 初始化失败。\n");
        student_manager_free(manager);
        return 1;
    }
#endif

    socket_handle_t server_socket = socket(AF_INET, SOCK_STREAM, 0);
    if (server_socket == INVALID_SOCKET_HANDLE)
    {
        perror("创建 socket 失败");
        student_manager_free(manager);
#ifdef _WIN32
        WSACleanup();
#endif
        return 1;
    }

    int reuse = 1;
    setsockopt(server_socket, SOL_SOCKET, SO_REUSEADDR,
               (const char *)&reuse, sizeof(reuse));

    struct sockaddr_in address;
    memset(&address, 0, sizeof(address));
    address.sin_family = AF_INET;
    address.sin_addr.s_addr = inet_addr("127.0.0.1");
    address.sin_port = htons((unsigned short)port);

    if (bind(server_socket, (struct sockaddr *)&address, sizeof(address)) != 0)
    {
        perror("绑定端口失败（端口可能已被占用）");
        close_socket(server_socket);
        student_manager_free(manager);
#ifdef _WIN32
        WSACleanup();
#endif
        return 1;
    }

    if (listen(server_socket, 16) != 0)
    {
        perror("监听端口失败");
        close_socket(server_socket);
        student_manager_free(manager);
#ifdef _WIN32
        WSACleanup();
#endif
        return 1;
    }

    printf("C 后端服务已启动：http://127.0.0.1:%d\n", port);
    printf("请用浏览器打开上面的地址；数据文件：%s\n", manager->filename);
    printf("按 Ctrl+C 停止服务。\n");

    while (true)
    {
#ifdef _WIN32
        int address_length = (int)sizeof(address);
        socket_handle_t client = accept(server_socket, (struct sockaddr *)&address, &address_length);
#else
        socklen_t address_length = sizeof(address);
        socket_handle_t client = accept(server_socket, (struct sockaddr *)&address, &address_length);
#endif
        if (client == INVALID_SOCKET_HANDLE)
        {
            perror("接受连接失败");
            continue;
        }
        handle_client(client, manager);
        close_socket(client);
    }

    close_socket(server_socket);
    student_manager_free(manager);
#ifdef _WIN32
    WSACleanup();
#endif
    return 0;
}
