import { useUIStore } from "@/stores/ui";
import { useTodos, useSessionStatuses } from "@/hooks/useSession";
import { useDevServerStatus, useDevServerRoutes } from "@/hooks/useWorkbook";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle2, Circle, Loader2, FileCode, Layout, Globe, ExternalLink, AlertCircle, BarChart3, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export function ContentPanel() {
  const { activeSessionId, activeWorkbookId } = useUIStore();
  const { data: todos = [] } = useTodos(activeSessionId);
  const { data: sessionStatuses = {} } = useSessionStatuses();
  const { data: devStatus } = useDevServerStatus(activeWorkbookId);
  const { data: devRoutes } = useDevServerRoutes(activeWorkbookId);

  const status = activeSessionId ? sessionStatuses[activeSessionId] : null;
  const completedCount = todos.filter((t) => t.status === "completed").length;
  const inProgressTodo = todos.find((t) => t.status === "in_progress");

  if (!activeSessionId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/30">
        <div className="text-center text-muted-foreground">
          <Layout className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No session</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-muted/30">
      {/* Header */}
      <div className="h-10 flex items-center justify-between px-4 border-b border-border">
        <div className="flex items-center gap-2">
          <FileCode className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Preview</span>
          {devStatus?.running && (
            <span className="flex items-center gap-1 text-xs text-green-500">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              :8787
            </span>
          )}
        </div>
        {status?.type === "busy" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            {inProgressTodo?.content || "Working..."}
          </div>
        )}
      </div>

      {/* Content area */}
      <div className="flex-1 flex">
        {/* Main preview area - show charts, monitors, and routes */}
        <div className="flex-1 flex flex-col">
          {devRoutes?.available ? (
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-6">
                {/* Charts Section */}
                {devRoutes.charts.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      Charts
                      <span className="text-xs text-muted-foreground">({devRoutes.charts.length})</span>
                    </h3>
                    <div className="grid gap-2">
                      {devRoutes.charts.map((chart) => (
                        <div
                          key={chart.id}
                          className="flex items-center justify-between p-3 rounded-lg border border-border bg-card"
                        >
                          <div className="flex items-center gap-3">
                            <div className="px-2 py-1 rounded text-xs font-mono bg-purple-500/10 text-purple-500">
                              {chart.chart_type}
                            </div>
                            <div>
                              <div className="text-sm font-medium">{chart.title}</div>
                              {chart.description && (
                                <div className="text-xs text-muted-foreground">{chart.description}</div>
                              )}
                            </div>
                          </div>
                          <code className="text-xs text-muted-foreground">{chart.id}</code>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Cron Triggers Section */}
                {devRoutes.crons.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Scheduled Triggers
                      <span className="text-xs text-muted-foreground">({devRoutes.crons.length})</span>
                    </h3>
                    <div className="grid gap-2">
                      {devRoutes.crons.map((cron) => (
                        <div
                          key={cron.cron}
                          className="flex items-center justify-between p-3 rounded-lg border border-border bg-card"
                        >
                          <div className="flex items-center gap-3">
                            <code className="px-2 py-1 rounded text-xs font-mono bg-orange-500/10 text-orange-500">
                              {cron.cron}
                            </code>
                            {cron.description && (
                              <span className="text-sm text-muted-foreground">{cron.description}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Routes Section */}
                {devRoutes.routes.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium flex items-center gap-2">
                        <Globe className="h-4 w-4" />
                        API Routes
                        <span className="text-xs text-muted-foreground">({devRoutes.routes.length})</span>
                      </h3>
                      <a
                        href={devRoutes.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        {devRoutes.url}
                      </a>
                    </div>
                    <div className="grid gap-2">
                      {devRoutes.routes.map((route) => (
                        <a
                          key={`${route.method}-${route.path}`}
                          href={`${devRoutes.url}${route.path}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-accent transition-colors group"
                        >
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "px-2 py-1 rounded text-xs font-mono font-medium",
                              route.method === "GET" ? "bg-green-500/10 text-green-500" :
                              route.method === "POST" ? "bg-blue-500/10 text-blue-500" :
                              route.method === "PUT" ? "bg-yellow-500/10 text-yellow-500" :
                              route.method === "DELETE" ? "bg-red-500/10 text-red-500" :
                              "bg-muted text-muted-foreground"
                            )}>
                              {route.method}
                            </div>
                            <code className="text-sm">{route.path}</code>
                          </div>
                          <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Empty state when no content */}
                {devRoutes.charts.length === 0 && devRoutes.crons.length === 0 && devRoutes.routes.length === 0 && (
                  <div className="flex-1 flex items-center justify-center py-12">
                    <div className="text-center text-muted-foreground">
                      <Layout className="h-12 w-12 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">No content detected yet</p>
                      <p className="text-xs mt-1 opacity-60">
                        Add charts, monitors, or routes to see them here
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          ) : devStatus?.running && !devRoutes?.available ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin opacity-50" />
                <p className="text-sm">Dev server is starting...</p>
                <p className="text-xs mt-1 opacity-60">
                  Content will appear once ready
                </p>
              </div>
            </div>
          ) : !devStatus?.running ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <AlertCircle className="h-8 w-8 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Dev server not running</p>
                <p className="text-xs mt-1 opacity-60">
                  Open a workbook to start the dev server
                </p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <Layout className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No content configured yet</p>
                <p className="text-xs mt-1 opacity-60">
                  Add charts, monitors, or routes to get started
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Tasks panel - only show if there are tasks */}
        {todos.length > 0 && (
          <div className="w-60 border-l border-border flex flex-col">
            <div className="px-3 py-2 border-b border-border">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium">Tasks</span>
                <span className="text-xs text-muted-foreground">
                  {completedCount}/{todos.length}
                </span>
              </div>
              {/* Progress bar */}
              <div className="h-1 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 transition-all duration-300 ease-out"
                  style={{ width: `${todos.length > 0 ? (completedCount / todos.length) * 100 : 0}%` }}
                />
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="py-1">
                {todos.map((todo, index) => (
                  <div
                    key={todo.id || index}
                    className={cn(
                      "flex items-start gap-2 px-3 py-2 text-xs border-b border-border/30 last:border-b-0",
                      todo.status === "in_progress" && "bg-blue-500/5",
                      todo.status === "completed" && "opacity-60"
                    )}
                  >
                    <div className="mt-0.5 shrink-0">
                      {todo.status === "completed" && (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                      )}
                      {todo.status === "in_progress" && (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                      )}
                      {todo.status === "pending" && (
                        <Circle className="h-3.5 w-3.5 text-muted-foreground/40" />
                      )}
                    </div>
                    <span
                      className={cn(
                        "leading-tight flex-1",
                        todo.status === "completed" && "text-muted-foreground line-through"
                      )}
                    >
                      {todo.content}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  );
}
