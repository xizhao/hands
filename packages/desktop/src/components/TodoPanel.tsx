import { memo } from "react";
import type { Todo } from "@/lib/api";
import { useTodos } from "@/hooks/useSession";
import { useActiveSession } from "@/hooks/useNavState";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle2, Circle, Loader2, ListTodo } from "lucide-react";
import { cn } from "@/lib/utils";

const TodoItem = memo(({ todo }: { todo: Todo }) => {
  const statusIcon = {
    pending: <Circle className="h-3.5 w-3.5 text-muted-foreground" />,
    in_progress: <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />,
    completed: <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />,
  }[todo.status];

  return (
    <div
      className={cn(
        "flex items-start gap-2 px-3 py-2 text-sm border-b border-border/50 last:border-b-0",
        todo.status === "completed" && "opacity-60",
        todo.status === "in_progress" && "bg-blue-500/5"
      )}
    >
      <span className="shrink-0 mt-0.5">{statusIcon}</span>
      <span
        className={cn(
          "flex-1",
          todo.status === "completed" && "line-through text-muted-foreground"
        )}
      >
        {todo.content}
      </span>
    </div>
  );
});

TodoItem.displayName = "TodoItem";

export const TodoPanel = memo(() => {
  const { sessionId: activeSessionId } = useActiveSession();
  const { data: todos = [], isLoading } = useTodos(activeSessionId);

  const completedCount = todos.filter((t) => t.status === "completed").length;
  const totalCount = todos.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  if (!activeSessionId) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <ListTodo className="h-6 w-6 mx-auto mb-2 opacity-50" />
          <p className="text-xs">No session selected</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (todos.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <ListTodo className="h-6 w-6 mx-auto mb-2 opacity-50" />
          <p className="text-xs">No tasks yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with progress */}
      <div className="px-3 py-2 border-b border-border">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium">Tasks</span>
          <span className="text-xs text-muted-foreground">
            {completedCount}/{totalCount}
          </span>
        </div>
        <div className="h-1 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Todo list */}
      <ScrollArea className="flex-1">
        <div className="py-1">
          {todos.map((todo) => (
            <TodoItem key={todo.id} todo={todo} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
});

TodoPanel.displayName = "TodoPanel";
