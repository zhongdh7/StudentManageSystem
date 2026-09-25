#ifndef FORWARD_H
#define FORWARD_H
#include "Student.h"
#include <stdbool.h>

//万能数据
typedef void* Data;
//节点
typedef struct Node
{
    //数据
    Data data;
    //指针
    struct Node* next;
}Node;

typedef struct ForwardList
{
    Node* front;//指向第一个数据节点
    Node* tail;//指向最后一个数据节点
    int size;//链表的长度
}ForwardList;

// 节点的创建与销毁
Node* node_alloc(Data data);
void node_free(Node* node);

//链表的创建与销毁
ForwardList* flist_alloc();
void flist_free(ForwardList* list);

//判断链表是否为空
bool flist_empty(ForwardList* flist);

//将节点插入到链表的头插
void flist_push_front(ForwardList* flist, Data data);

//将节点插入到链表的尾插
void flist_push_back(ForwardList* flist, Data data);


#endif