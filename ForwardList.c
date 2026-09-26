#include "ForwardList.h"
#include <stdlib.h>
#include <assert.h>
#include <stdio.h>

void flist_print(ForwardList *flist, STUDENT_PRINT print)
{
    Node *current = flist->front;
    while (current)
    {
        print((Student *)current->data);
        current = current->next;
    }
}

Node *node_alloc(Data data)
{
    Node *node = (Node *)malloc(sizeof(Node));
    if (!node)
        return NULL;
    node->data = data;
    node->next = NULL;
    return node;
}
void node_free(Node *node)
{
    if (node)
    {
        if (node->data)
        {
            free(node->data);
        }
        free(node);
    }
}

ForwardList *flist_alloc()
{
    ForwardList *flist = (ForwardList *)malloc(sizeof(ForwardList));
    if (!flist)
        return NULL;
    flist->front = NULL;
    flist->tail = NULL;
    flist->size = 0;
    return flist;
}

void flist_free(ForwardList *flist)
{
    if (!flist)
        return;
    Node *current = flist->front;
    while (current)
    {
        Node *next = current->next;
        node_free(current);
        current = next;
    }
    free(flist);
}

bool flist_empty(ForwardList *flist)
{
    assert(flist != NULL);
    return (flist->front == NULL && flist->tail == NULL) || flist->size == 0;
}

void flist_push_front(ForwardList *flist, Data data)
{
    assert(flist != NULL);
    if (!flist || !data)
        return;
    Node *new_node = node_alloc(data);
    if (flist_empty(flist))
    {
        flist->front = new_node;
        flist->tail = new_node;
    }
    else
    {
        new_node->next = flist->front;
        flist->front = new_node;
    }

    flist->size++;
}

void flist_push_back(ForwardList *flist, Data data)
{
    assert(flist != NULL);
    if (!flist || !data)
        return;
    Node *new_node = node_alloc(data);
    if (flist_empty(flist))
    {
        flist->front = new_node;
        flist->tail = new_node;
    }
    else
    {
        flist->tail->next = new_node;
        flist->tail = new_node;
    }

    flist->size++;
}

Data flist_find(ForwardList *flist, int number)
{
    assert(flist != NULL);
    if (flist_empty(flist))
    {
        return NULL;
    }
    Node *current = flist->front;
    Student *temp = (Student *)current->data;

    while (current)
    {
        temp = (Student *)current->data;
        if (temp->number == number)
        {
            return temp;
        }
        current = current->next;
    }
    return NULL;
}

Data flist_find_data(ForwardList *flist, Data data, STUDENT_COMPARE cmp)
{
    assert(flist != NULL);
    if (flist_empty(flist))
    {
        return NULL;
    }
    Node *current = flist->front;
    while (current)
    {
        if (cmp((Student *)current->data, (Student *)data))
        {
            return current->data;
        }
        current = current->next;
    }
    return NULL;
}

void flist_remove(ForwardList *flist, Data data, STUDENT_COMPARE cmp)
{
    assert(flist != NULL);
    if (flist_empty(flist))
    {
        printf("链表为空\n");
        return;
    }
    Node *pre_node = NULL;
    Node *cur_node = flist->front;
    while (cur_node)
    {
        if (cmp((Student *)cur_node->data, (Student *)data))
        {
            break;
        }
        pre_node = cur_node;
        cur_node = cur_node->next;
    }

    if (cur_node)
    {
        if (pre_node == NULL)
        {
            flist->front = cur_node->next;
            if (flist->front == NULL)
                flist->tail = NULL;
            node_free(cur_node);
        }
        else
        {
            pre_node->next = cur_node->next;
            if (pre_node->next == NULL)
                flist->tail = pre_node;
            node_free(cur_node);
        }
        flist->size--;
    }
    else
    {
        printf("没有相关数据\n");
    }
}

void flist_remove_front(ForwardList *flist)
{
    assert(flist != NULL);
    if (flist_empty(flist))
    {
        return;
    }
    Node *pre_front = flist->front;
    flist->front = pre_front->next;
    if (flist->front == NULL)
    {
        flist->tail = NULL;
    }
    node_free(pre_front);
    flist->size--;
}

void flist_remove_tail(ForwardList *flist)
{
    assert(flist != NULL);
    if (flist_empty(flist))
    {
        return;
    }

    Node *before_tail = flist->front;
    if (flist->front == flist->tail)
    {
        flist->tail = NULL;
        node_free(flist->front);
        flist->front = NULL;
        flist->size--;
        return;
    }
    while (before_tail->next != flist->tail && before_tail)
    {
        before_tail = before_tail->next;
    }

    Node *tail = flist->tail;
    before_tail->next = NULL;
    flist->tail = before_tail;
    node_free(tail);
    flist->size--;
}