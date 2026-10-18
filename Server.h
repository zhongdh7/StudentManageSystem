#ifndef SERVER_H
#define SERVER_H

#define SERVER_DEFAULT_PORT 8080

// 以 HTTP 服务模式运行，托管 web/ 目录并提供 /api/* 接口。
// 返回 0 表示正常结束，非 0 表示启动失败。
int server_run(int port);

#endif
