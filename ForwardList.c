#include "ForwardList.h"
#include <stdlib.h>
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
    return flist;
}

void flist_free(ForwardList* flist)
{
    if(flist)
        free(flist);
}