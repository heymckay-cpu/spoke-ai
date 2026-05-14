import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  MessageSquarePlus,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import {
  getListQaConversationsQueryKey,
  useDeleteQaConversation,
  useListQaConversations,
  useRenameQaConversation,
  type QaConversationListItem,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

interface QaConversationsRailProps {
  activeId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
  onActiveDeleted: () => void;
  collapsed: boolean;
  onToggleCollapsed: (next: boolean) => void;
  className?: string;
}

export function QaConversationsRail({
  activeId,
  onSelect,
  onNew,
  onActiveDeleted,
  collapsed,
  onToggleCollapsed,
  className,
}: QaConversationsRailProps) {
  const queryClient = useQueryClient();
  const listQuery = useListQaConversations(
    { limit: 50, offset: 0 },
    {
      query: {
        queryKey: getListQaConversationsQueryKey({ limit: 50, offset: 0 }),
        staleTime: 10_000,
      },
    },
  );
  const renameMutation = useRenameQaConversation();
  const deleteMutation = useDeleteQaConversation();

  const conversations: QaConversationListItem[] = listQuery.data?.conversations ?? [];

  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const editingInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editingId != null) editingInputRef.current?.focus();
  }, [editingId]);

  function startRename(c: QaConversationListItem) {
    setEditingId(c.id);
    setDraftTitle(c.title);
  }
  function cancelRename() {
    setEditingId(null);
    setDraftTitle("");
  }
  async function commitRename(id: number) {
    const title = draftTitle.trim();
    if (!title) {
      cancelRename();
      return;
    }
    try {
      await renameMutation.mutateAsync({ id, data: { title } });
      await queryClient.invalidateQueries({
        queryKey: getListQaConversationsQueryKey({ limit: 50, offset: 0 }),
      });
    } finally {
      cancelRename();
    }
  }

  async function handleDelete(c: QaConversationListItem) {
    const ok = window.confirm(`Delete "${c.title}"? This cannot be undone.`);
    if (!ok) return;
    await deleteMutation.mutateAsync({ id: c.id });
    await queryClient.invalidateQueries({
      queryKey: getListQaConversationsQueryKey({ limit: 50, offset: 0 }),
    });
    if (activeId === c.id) onActiveDeleted();
  }

  if (collapsed) {
    return (
      <div
        className={cn(
          "flex w-10 shrink-0 flex-col items-center gap-2 border-r border-border bg-card/40 py-3",
          className,
        )}
        data-testid="qa-rail-collapsed"
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onToggleCollapsed(false)}
          aria-label="Expand conversations"
          data-testid="button-qa-rail-expand"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onNew}
          aria-label="New conversation"
          data-testid="button-qa-new-collapsed"
        >
          <MessageSquarePlus className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <aside
      className={cn(
        "flex w-64 shrink-0 flex-col border-r border-border bg-card/40",
        className,
      )}
      data-testid="qa-rail"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Conversations
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={onNew}
            aria-label="New conversation"
            title="New conversation"
            data-testid="button-qa-new"
          >
            <MessageSquarePlus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onToggleCollapsed(true)}
            aria-label="Collapse conversations"
            data-testid="button-qa-rail-collapse"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {listQuery.isLoading && (
          <div className="px-2 py-4 text-xs text-muted-foreground" data-testid="qa-rail-loading">
            Loading…
          </div>
        )}
        {!listQuery.isLoading && conversations.length === 0 && (
          <div className="px-2 py-4 text-xs text-muted-foreground" data-testid="qa-rail-empty">
            No conversations yet. Send a message to start one.
          </div>
        )}
        <ul className="space-y-0.5">
          {conversations.map((c) => {
            const isActive = c.id === activeId;
            const isEditing = c.id === editingId;
            return (
              <li key={c.id}>
                <div
                  className={cn(
                    "group flex flex-col rounded-md px-2 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/50",
                  )}
                  data-testid={`qa-rail-item-${c.id}`}
                  data-active={isActive ? "true" : undefined}
                >
                  {isEditing ? (
                    <form
                      className="flex items-center gap-1"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void commitRename(c.id);
                      }}
                    >
                      <Input
                        ref={editingInputRef}
                        value={draftTitle}
                        onChange={(e) => setDraftTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            e.preventDefault();
                            cancelRename();
                          }
                        }}
                        className="h-7 px-2 text-xs"
                        maxLength={200}
                        data-testid={`input-qa-rename-${c.id}`}
                      />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label="Save"
                        data-testid={`button-qa-rename-save-${c.id}`}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={cancelRename}
                        aria-label="Cancel"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </form>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => onSelect(c.id)}
                        className="flex w-full flex-col items-start gap-0.5 text-left"
                        data-testid={`button-qa-select-${c.id}`}
                      >
                        <span className="line-clamp-1 text-sm font-medium">
                          {c.title}
                        </span>
                        {c.lastMessagePreview && (
                          <span className="line-clamp-1 text-xs text-muted-foreground">
                            {c.lastMessagePreview}
                          </span>
                        )}
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80">
                          {fmtRelative(c.lastMessageAt ?? c.createdAt)}
                        </span>
                      </button>
                      <div
                        className={cn(
                          "mt-1 flex items-center gap-0.5",
                          isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                        )}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            startRename(c);
                          }}
                          aria-label="Rename conversation"
                          data-testid={`button-qa-rename-${c.id}`}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDelete(c);
                          }}
                          aria-label="Delete conversation"
                          data-testid={`button-qa-delete-${c.id}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
