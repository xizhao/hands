import { useUIStore } from "@/stores/ui";
import { useServer } from "@/hooks/useServer";
import { useDatabase } from "@/hooks/useDatabase";
import { useSessions, useCreateSession, useDeleteSession } from "@/hooks/useSession";
import { useWorkbook } from "@/hooks/useWorkbook";
import { useSettings, modelOptions, providerOptions, type Settings as SettingsType } from "@/hooks/useSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { X, Plus, Settings, RefreshCw, Database, Cpu, Brain, ChevronDown, ChevronUp, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { isConnected: agentConnected, isConnecting: agentConnecting, restartServer } = useServer();
  const { isConnected: dbConnected, isConnecting: dbConnecting, status: dbStatus } = useDatabase();
  const { settings, loading: settingsLoading, updateSetting, updateApiKey, currentApiKey } = useSettings();
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyChanged, setApiKeyChanged] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    ai: true,
    agent: false,
    database: false,
  });

  // Get the correct API key field name for the current provider
  const getApiKeyField = () => {
    switch (settings.provider) {
      case "anthropic":
        return "anthropic_api_key" as const;
      case "openai":
        return "openai_api_key" as const;
      case "google":
        return "google_api_key" as const;
      default:
        return null;
    }
  };

  const apiKeyField = getApiKeyField();

  const handleApiKeyChange = async (value: string) => {
    if (apiKeyField) {
      await updateApiKey(apiKeyField, value);
      setApiKeyChanged(true);
    }
  };

  const handleApplyApiKey = async () => {
    await restartServer();
    setApiKeyChanged(false);
  };

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <div className="absolute top-full right-0 mt-1 w-80 bg-background border border-border rounded-md shadow-lg z-50 p-3 max-h-[80vh] overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium">Settings</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-3">
        {/* AI Provider Section */}
        <div className="space-y-2">
          <button
            onClick={() => toggleSection("ai")}
            className="flex items-center justify-between w-full text-xs text-muted-foreground uppercase tracking-wide hover:text-foreground"
          >
            <div className="flex items-center gap-2">
              <Brain className="h-3 w-3" />
              AI Provider
            </div>
            {expandedSections.ai ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {expandedSections.ai && !settingsLoading && (
            <div className="bg-muted/50 rounded-md p-2 space-y-3">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Provider</span>
                <Select
                  value={settings.provider}
                  onValueChange={(value) => updateSetting("provider", value as SettingsType["provider"])}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {providerOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value} className="text-xs">
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Model</span>
                <Select
                  value={settings.model}
                  onValueChange={(value) => updateSetting("model", value)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {modelOptions[settings.provider]?.map((option) => (
                      <SelectItem key={option.value} value={option.value} className="text-xs">
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {apiKeyField && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">API Key</span>
                    <button
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      {showApiKey ? "Hide" : "Show"}
                    </button>
                  </div>
                  <Input
                    type={showApiKey ? "text" : "password"}
                    value={currentApiKey}
                    onChange={(e) => handleApiKeyChange(e.target.value)}
                    placeholder={settings.provider === "anthropic" ? "sk-ant-..." : settings.provider === "openai" ? "sk-..." : "AI..."}
                    className="h-8 text-xs font-mono"
                  />
                  {apiKeyChanged && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-2 h-7 text-xs mt-2"
                      onClick={handleApplyApiKey}
                      disabled={agentConnecting}
                    >
                      <RefreshCw className={cn("h-3 w-3", agentConnecting && "animate-spin")} />
                      Apply & Restart Server
                    </Button>
                  )}
                </div>
              )}
              {!apiKeyField && settings.provider === "amazon-bedrock" && (
                <div className="text-xs text-muted-foreground">
                  Bedrock uses AWS credentials from environment
                </div>
              )}
              {!apiKeyField && settings.provider === "openrouter" && (
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">OpenRouter uses your configured provider keys</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Agent Server Section */}
        <div className="space-y-2">
          <button
            onClick={() => toggleSection("agent")}
            className="flex items-center justify-between w-full text-xs text-muted-foreground uppercase tracking-wide hover:text-foreground"
          >
            <div className="flex items-center gap-2">
              <Cpu className="h-3 w-3" />
              Agent Server
            </div>
            {expandedSections.agent ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {expandedSections.agent && (
            <div className="bg-muted/50 rounded-md p-2 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "h-2 w-2 rounded-full",
                      agentConnected ? "bg-green-500" : agentConnecting ? "bg-yellow-500 animate-pulse" : "bg-red-500"
                    )}
                  />
                  <span className="text-xs">
                    {agentConnected ? "Connected" : agentConnecting ? "Connecting" : "Disconnected"}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Port</span>
                <span className="text-xs font-mono">4096</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2 h-7 text-xs"
                onClick={() => restartServer()}
                disabled={agentConnecting}
              >
                <RefreshCw className={cn("h-3 w-3", agentConnecting && "animate-spin")} />
                Restart
              </Button>
            </div>
          )}
        </div>

        {/* Database Section */}
        <div className="space-y-2">
          <button
            onClick={() => toggleSection("database")}
            className="flex items-center justify-between w-full text-xs text-muted-foreground uppercase tracking-wide hover:text-foreground"
          >
            <div className="flex items-center gap-2">
              <Database className="h-3 w-3" />
              PostgreSQL
            </div>
            {expandedSections.database ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {expandedSections.database && (
            <div className="bg-muted/50 rounded-md p-2 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "h-2 w-2 rounded-full",
                      dbConnected ? "bg-green-500" : dbConnecting ? "bg-yellow-500 animate-pulse" : "bg-red-500"
                    )}
                  />
                  <span className="text-xs">
                    {dbConnected ? "Connected" : dbConnecting ? "Connecting" : "Disconnected"}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Database</span>
                <span className="text-xs font-mono">{dbStatus?.database ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Port</span>
                <span className="text-xs font-mono">{dbStatus?.port ?? "—"}</span>
              </div>
              {dbStatus?.stats && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Storage</span>
                    <span className="text-xs font-mono">{dbStatus.stats.size_formatted}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Tables</span>
                    <span className="text-xs font-mono">{dbStatus.stats.table_count}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Connections</span>
                    <span className="text-xs font-mono">{dbStatus.stats.connection_count}</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function TabBar() {
  const { activeSessionId, setActiveSession, activeWorkbookId, setActiveWorkbook } = useUIStore();
  const { isConnected: agentConnected } = useServer();
  const { isConnected: dbConnected } = useDatabase();
  const { data: sessions = [] } = useSessions();
  const { data: activeWorkbook } = useWorkbook(activeWorkbookId);
  const createSession = useCreateSession();
  const deleteSession = useDeleteSession();
  const [showSettings, setShowSettings] = useState(false);

  const allConnected = agentConnected && dbConnected;

  const handleSwitchWorkbook = () => {
    setActiveWorkbook(null, null);
  };

  const handleCreateSession = () => {
    createSession.mutate(undefined, {
      onSuccess: (session) => {
        setActiveSession(session.id);
      },
    });
  };

  const handleDeleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteSession.mutate(id, {
      onSuccess: () => {
        if (activeSessionId === id) {
          const remaining = sessions.filter((s) => s.id !== id);
          setActiveSession(remaining[0]?.id || null);
        }
      },
    });
  };

  const handleTabClick = (id: string) => {
    setActiveSession(id);
  };

  return (
    <div className="relative h-9 bg-muted/50 border-b border-border">
      {/* Drag region - spans the entire bar, sits behind everything */}
      <div
        data-tauri-drag-region
        className="absolute inset-0 pl-[70px]"
      />

      {/* Workbook indicator in the left drag area */}
      <div className="absolute left-0 top-0 h-full flex items-center pl-2 pr-1 z-10">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs max-w-[60px]"
              onClick={handleSwitchWorkbook}
            >
              <FolderOpen className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{activeWorkbook?.name || "..."}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-xs">Switch workbook</p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Content layer - sits on top of drag region */}
      <div className="relative h-full flex items-end justify-between pl-[70px] pr-2">
        {/* Tabs */}
        <div className="flex items-end gap-px h-full">
          {sessions.map((session) => (
            <div
              key={session.id}
              onClick={() => handleTabClick(session.id)}
              className={cn(
                "group relative flex items-center gap-2 h-8 px-3 text-sm transition-colors rounded-t-lg cursor-pointer",
                activeSessionId === session.id
                  ? "bg-background text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50"
              )}
            >
              <span className="truncate max-w-[120px]">
                {session.title || "New tab"}
              </span>
              <div
                onClick={(e) => handleDeleteSession(e, session.id)}
                className={cn(
                  "h-4 w-4 rounded-sm flex items-center justify-center cursor-pointer",
                  "opacity-0 group-hover:opacity-100 hover:bg-muted transition-opacity"
                )}
              >
                <X className="h-3 w-3" />
              </div>
            </div>
          ))}

          {/* New tab button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-none"
            onClick={handleCreateSession}
            disabled={createSession.isPending}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Flexible drag space between tabs and settings */}
        <div data-tauri-drag-region className="flex-1 h-full" />

        {/* Right side - Settings */}
        <div className="relative flex items-center h-full pb-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setShowSettings(!showSettings)}
          >
            <div className="relative">
              <Settings className="h-4 w-4" />
              <div
                className={cn(
                  "absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full",
                  allConnected ? "bg-green-500" : "bg-red-500"
                )}
              />
            </div>
          </Button>

          {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
        </div>
      </div>
    </div>
  );
}
