import { X, ChevronDown, Database, Cpu, Bot, Wrench, RotateCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useSettings, modelOptions, providerOptions, type Settings } from "@/hooks/useSettings";
import { useThemeStore, getThemeList, THEMES } from "@/stores/theme";
import { useDatabase } from "@/hooks/useDatabase";
import { useServer } from "@/hooks/useServer";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { settings, loading, updateSetting, updateApiKey, currentApiKey, syncModel } = useSettings();
  const { currentTheme, setTheme } = useThemeStore();
  const themeList = getThemeList();

  // Status hooks
  const { isConnected: dbConnected, status: dbStatus } = useDatabase();
  const { isConnected: serverConnected, isConnecting, isRestarting, restartServer } = useServer();

  // Fetch agents and tools
  const { data: agents = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: api.agents.list,
    enabled: serverConnected,
  });

  const { data: tools = [] } = useQuery({
    queryKey: ["tools"],
    queryFn: api.tools.ids,
    enabled: serverConnected,
  });

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

  if (loading) return null;

  return (
    <div className="flex-1 mt-2 mx-2 mb-2 px-3 py-3 overflow-auto animate-in fade-in duration-150 bg-zinc-900 rounded-xl border border-zinc-800">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium text-zinc-300">Settings</span>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-4">
        {/* Provider & Model row */}
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1 block">
              Provider
            </label>
            <div className="relative">
              <select
                value={settings.provider}
                onChange={(e) => updateSetting("provider", e.target.value as Settings["provider"])}
                className="w-full h-8 px-2 pr-7 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-200 appearance-none focus:outline-none focus:border-zinc-600"
              >
                {providerOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-500 pointer-events-none" />
            </div>
          </div>

          <div className="flex-1">
            <label className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1 block">
              Model
            </label>
            <div className="relative">
              <select
                value={settings.model}
                onChange={(e) => updateSetting("model", e.target.value)}
                className="w-full h-8 px-2 pr-7 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-200 appearance-none focus:outline-none focus:border-zinc-600"
              >
                {modelOptions[settings.provider]?.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-500 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* API Key */}
        {apiKeyField && (
          <div>
            <label className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1 block">
              API Key
            </label>
            <input
              type="password"
              value={currentApiKey}
              onChange={(e) => updateApiKey(apiKeyField, e.target.value)}
              onBlur={async () => {
                // Restart server to pick up new API key, then sync model
                if (currentApiKey) {
                  try {
                    await restartServer();
                    // Wait a bit for server to be ready, then sync model
                    setTimeout(() => syncModel(), 1000);
                  } catch (e) {
                    console.error("Failed to restart server:", e);
                  }
                }
              }}
              placeholder={`${settings.provider} API key`}
              className="w-full h-8 px-2 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 font-mono"
            />
          </div>
        )}

        {/* Theme */}
        <div>
          <label className="text-[10px] uppercase tracking-wide text-zinc-500 mb-2 block">
            Theme
          </label>
          <div className="flex flex-wrap gap-1.5">
            {themeList.map((theme) => {
              const colors = THEMES[theme.id].colors;
              const isActive = currentTheme === theme.id;
              return (
                <button
                  key={theme.id}
                  onClick={() => setTheme(theme.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded text-[10px] border transition-colors",
                    isActive
                      ? "border-zinc-500 bg-zinc-800 text-zinc-200"
                      : "border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-400"
                  )}
                >
                  <div
                    className="w-2.5 h-2.5 rounded-full border border-white/10"
                    style={{ background: `hsl(${colors.primary})` }}
                  />
                  <span>{theme.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-zinc-800" />

        {/* Status row */}
        <div className="flex gap-4">
          {/* Database status */}
          <div className="flex items-center gap-2">
            <Database className="h-3.5 w-3.5 text-zinc-500" />
            <div className="flex items-center gap-1.5">
              <div className={cn(
                "h-1.5 w-1.5 rounded-full",
                dbConnected ? "bg-green-500" : "bg-red-500"
              )} />
              <span className="text-[10px] text-zinc-400">
                {dbConnected ? dbStatus?.database || "PostgreSQL" : "Disconnected"}
              </span>
              {dbStatus?.stats && (
                <span className="text-[10px] text-zinc-600">
                  {dbStatus.stats.size_formatted}
                </span>
              )}
            </div>
          </div>

          {/* Server status */}
          <div className="flex items-center gap-2">
            <Cpu className="h-3.5 w-3.5 text-zinc-500" />
            <div className="flex items-center gap-1.5">
              <div className={cn(
                "h-1.5 w-1.5 rounded-full",
                isRestarting || isConnecting ? "bg-yellow-500 animate-pulse" :
                serverConnected ? "bg-green-500" : "bg-red-500"
              )} />
              <span className="text-[10px] text-zinc-400">
                {isRestarting ? "Restarting..." :
                 isConnecting ? "Connecting..." :
                 serverConnected ? "OpenCode" : "Disconnected"}
              </span>
            </div>
            <button
              onClick={() => restartServer()}
              disabled={isRestarting}
              className={cn(
                "p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors",
                isRestarting && "opacity-50 cursor-not-allowed"
              )}
              title="Restart OpenCode server"
            >
              <RotateCw className={cn("h-3 w-3", isRestarting && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* Agents */}
        {serverConnected && agents.length > 0 && (
          <div>
            <label className="text-[10px] uppercase tracking-wide text-zinc-500 mb-2 flex items-center gap-1.5">
              <Bot className="h-3 w-3" />
              Agents ({agents.length})
            </label>
            <div className="flex flex-wrap gap-1.5">
              {agents.map((agent) => (
                <div
                  key={agent.name}
                  className="px-2 py-1 rounded text-[10px] bg-zinc-800 border border-zinc-700 text-zinc-300"
                  title={agent.description || agent.name}
                >
                  {agent.name}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tools */}
        {serverConnected && tools.length > 0 && (
          <div>
            <label className="text-[10px] uppercase tracking-wide text-zinc-500 mb-2 flex items-center gap-1.5">
              <Wrench className="h-3 w-3" />
              Tools ({tools.length})
            </label>
            <div className="flex flex-wrap gap-1">
              {tools.map((tool) => (
                <span
                  key={tool}
                  className="px-1.5 py-0.5 rounded text-[9px] bg-zinc-800/50 text-zinc-500"
                >
                  {tool}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
