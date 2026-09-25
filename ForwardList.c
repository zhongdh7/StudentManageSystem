#include "ForwardList.h"
#include <stdlib.h>
#include <assert.h>
Node* node_alloc(Data data)
{
    Node* node=(Node*)malloc(sizeof(Node));
    if(!node)
        return NULL;
    node->data=data;
    node->next=NULL;
    return node;
}
void node_free(Node* node)
{
    if(node)
    {
        free(node);
    }
}

ForwardList* flist_alloc()
{
    ForwardList* flist=(ForwardList*)malloc(sizeof(ForwardList));
    if(!flist)
        return NULL;
    flist->front=NULL;
    flist->tail=NULL;
    flist->size=0;
    return flist;
}

void flist_free(ForwardList* flist)
{
    if(flist)
        free(flist);
}

bool flist_empty(ForwardList* flist)
{
    assert(flist!=NULL);
    return (flist->front==NULL && flist->tail==NULL)||flist->size==0;
}

void flist_push_front(ForwardList* flist, Data data)
{
    assert(flist!=NULL);
    if(!flist||!data)
        return;
    Node* new_node=node_alloc(data);
    if(flist_empty(flist)) 
    {
        flist->front=new_node;
        flist->tail=new_node;
    }
    else
    {
        new_node->next=flist->front;
        flist->front=new_node;
    }

    flist->size++;
}

void flist_push_back(ForwardList* flist, Data data)
{
    assert(flist!=NULL);
    if(!flist||!data)
        return;
    Node* new_node=node_alloc(data);
    if(flist_empty(flist)) 
    {
        flist->front=new_node;
        flist->tail=new_node;
    }
    else
    {
        flist->tail->next=new_node;
        flist->tail=new_node;
    }

    flist->size++;
}