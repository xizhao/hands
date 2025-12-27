/**
 * ChatSettings - Hands Agent settings popover shown when clicking the Hand icon
 *
 * Shows:
 * - Agent server status with restart button
 * - OpenRouter API key input
 * - Advanced: Available agents and tools (collapsible)
 */

import { useQuery } from "@tanstack/react-query";
import { Bot, ChevronDown, ChevronRight, Hand, RotateCw, Wrench } from "lucide-react";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useServer } from "@/hooks/useServer";
import { useSettings } from "@/hooks/useSettings";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ChatSettingsProps {
  children: React.ReactNode;
}

export function ChatSettings({ children }: ChatSettingsProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const { loading, updateApiKey, currentApiKey } = useSettings();
  const { isConnected, isConnecting, isRestarting, restartServer } = useServer();

  // Fetch agents and tools
  const { data: agents = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: api.agents.list,
    enabled: isConnected,
  });

  const { data: tools = [] } = useQuery({
    queryKey: ["tools"],
    queryFn: api.tools.ids,
    enabled: isConnected,
  });

  if (loading) {
    return <>{children}</>;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-80 p-0" sideOffset={8}>
        {/* Header with status */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <div className="flex items-center gap-2">
            <Hand className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Hands Agent</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex rounded-full h-2 w-2",
                isRestarting || isConnecting
                  ? "bg-yellow-500 animate-pulse"
                  : isConnected
                    ? "bg-green-500"
                    : "bg-red-500",
              )}
            />
            <span className="text-xs text-muted-foreground">
              {isRestarting
                ? "Restarting..."
                : isConnecting
                  ? "Connecting..."
                  : isConnected
                    ? "Connected"
                    : "Disconnected"}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                restartServer();
              }}
              disabled={isRestarting}
              className={cn(
                "p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors",
                isRestarting && "opacity-50 cursor-not-allowed",
              )}
              title="Restart OpenCode server"
            >
              <RotateCw className={cn("h-3 w-3", isRestarting && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* API Key */}
        <div className="p-3">
          <div className="space-y-1.5">
            <label
              htmlFor="api-key-input"
              className="text-[10px] uppercase tracking-wide text-muted-foreground"
            >
              OpenRouter API Key
            </label>
            <input
              id="api-key-input"
              type="password"
              value={currentApiKey}
              onChange={(e) => updateApiKey(e.target.value)}
              onBlur={async () => {
                if (currentApiKey) {
                  try {
                    await restartServer();
                  } catch (e) {
                    console.error("Failed to restart server:", e);
                  }
                }
              }}
              placeholder="sk-or-..."
              className="w-full h-8 px-2 text-xs bg-muted border border-border rounded-md placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring font-mono"
            />
          </div>
        </div>

        {/* Advanced section (collapsible) */}
        {isConnected && (agents.length > 0 || tools.length > 0) && (
          <div className="border-t border-border">
            <button
              type="button"
              onClick={() => setAdvancedOpen(!advancedOpen)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {advancedOpen ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              <span>Advanced</span>
            </button>

            {advancedOpen && (
              <div className="px-3 pb-3 space-y-3">
                {/* Agents */}
                {agents.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                      <Bot className="h-3 w-3" />
                      Agents ({agents.length})
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {agents.map((agent) => (
                        <span
                          key={agent.name}
                          className="px-2 py-0.5 rounded text-[10px] bg-muted border border-border"
                          title={agent.description || agent.name}
                        >
                          {agent.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tools */}
                {tools.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                      <Wrench className="h-3 w-3" />
                      Tools ({tools.length})
                    </span>
                    <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                      {tools.map((tool) => (
                        <span
                          key={tool}
                          className="px-1.5 py-0.5 rounded text-[9px] bg-muted/50 text-muted-foreground"
                        >
                          {tool}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
