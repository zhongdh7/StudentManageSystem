#ifndef FORWARD_H
#define FORWARD_H
#include "Student.h"
#include <stdbool.h>

// 万能数据
typedef void *Data; // 这个目前在我们的项目里面是指这个Student类
// 节点
typedef struct Node
{
    // 数据
    Data data;
    // 指针
    struct Node *next;
} Node;

typedef struct ForwardList
{
    Node *front; // 指向第一个数据节点
    Node *tail;  // 指向最后一个数据节点
    int size;    // 链表的长度
} ForwardList;

typedef void (*STUDENT_PRINT)(Student *);
// 打印链表的所有信息
void flist_print(ForwardList *flist, STUDENT_PRINT print);

// 节点的创建与销毁
Node *node_alloc(Data data);
void node_free(Node *node);

// 链表的创建与销毁
ForwardList *flist_alloc();
void flist_free(ForwardList *list);

// 判断链表是否为空
bool flist_empty(ForwardList *flist);

// 将节点插入到链表的头插
void flist_push_front(ForwardList *flist, Data data);

// 将节点插入到链表的尾插
void flist_push_back(ForwardList *flist, Data data);

// 查找数据
Data flist_find(ForwardList *flist, int number);

// data 版本的查找
typedef bool (*STUDENT_COMPARE)(Student *, Student *);
Data flist_find_data(ForwardList *flist, Data data, STUDENT_COMPARE cmp);

// 删除功能
void flist_remove(ForwardList *, Data data, STUDENT_COMPARE);

//删除头
void flist_remove_front(ForwardList *flist);

//删除尾
void flist_remove_tail(ForwardList *flist);

#endif