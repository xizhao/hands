import { useState, useEffect } from "react";
import { Settings, Check, Moon, Sun } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useSettings, modelOptions, providerOptions, type Settings as SettingsType } from "@/hooks/useSettings";
import { useThemeStore, getThemeList, THEMES } from "@/stores/theme";
import { cn } from "@/lib/utils";

interface DatabaseStatus {
  connected: boolean;
  message: string;
  port: number;
  database: string;
  stats?: {
    size_bytes: number;
    size_formatted: string;
    table_count: number;
    connection_count: number;
  };
}

export function SettingsDialog() {
  const { settings, loading, updateSetting, updateApiKey, currentApiKey } = useSettings();
  const { currentTheme, setTheme } = useThemeStore();
  const [dbStatus, setDbStatus] = useState<DatabaseStatus | null>(null);
  const [open, setOpen] = useState(false);
  const themeList = getThemeList();

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

  // Fetch database status when dialog opens
  useEffect(() => {
    if (open) {
      invoke<DatabaseStatus>("get_database_status")
        .then(setDbStatus)
        .catch(console.error);
    }
  }, [open]);

  if (loading) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure your AI provider, model, and application settings.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="ai" className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="ai">AI Provider</TabsTrigger>
            <TabsTrigger value="database">Database</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
          </TabsList>

          <TabsContent value="ai" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="provider">Provider</Label>
              <Select
                value={settings.provider}
                onValueChange={(value) => updateSetting("provider", value as SettingsType["provider"])}
              >
                <SelectTrigger id="provider">
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {providerOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="model">Model</Label>
              <Select
                value={settings.model}
                onValueChange={(value) => updateSetting("model", value)}
              >
                <SelectTrigger id="model">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  {modelOptions[settings.provider]?.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {apiKeyField && (
              <div className="space-y-2">
                <Label htmlFor="apiKey">API Key</Label>
                <Input
                  id="apiKey"
                  type="password"
                  value={currentApiKey}
                  onChange={(e) => updateApiKey(apiKeyField, e.target.value)}
                  placeholder={`Enter your ${providerOptions.find(p => p.value === settings.provider)?.label} API key`}
                />
                <p className="text-xs text-muted-foreground">
                  Your API key is stored locally and never sent to our servers.
                  Restart the server after changing API keys.
                </p>
              </div>
            )}
            {!apiKeyField && settings.provider === "amazon-bedrock" && (
              <p className="text-sm text-muted-foreground">
                Bedrock uses AWS credentials from your environment variables.
              </p>
            )}
            {!apiKeyField && settings.provider === "openrouter" && (
              <p className="text-sm text-muted-foreground">
                OpenRouter uses your configured provider API keys.
              </p>
            )}
          </TabsContent>

          <TabsContent value="database" className="space-y-4 mt-4">
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Status</span>
                <div className="flex items-center gap-2">
                  <div
                    className={`h-2 w-2 rounded-full ${
                      dbStatus?.connected ? "bg-green-500" : "bg-red-500"
                    }`}
                  />
                  <span className="text-sm text-muted-foreground">
                    {dbStatus?.connected ? "Connected" : "Disconnected"}
                  </span>
                </div>
              </div>

              {dbStatus?.connected && (
                <>
                  <Separator />
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Database</span>
                      <p className="font-mono">{dbStatus.database}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Port</span>
                      <p className="font-mono">{dbStatus.port}</p>
                    </div>
                    {dbStatus.stats && (
                      <>
                        <div>
                          <span className="text-muted-foreground">Size</span>
                          <p className="font-mono">{dbStatus.stats.size_formatted}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Tables</span>
                          <p className="font-mono">{dbStatus.stats.table_count}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Connections</span>
                          <p className="font-mono">{dbStatus.stats.connection_count}</p>
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Hands uses an embedded PostgreSQL database for storing your data apps.
              The database starts automatically when the app launches.
            </p>
          </TabsContent>

          <TabsContent value="advanced" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="serverPort">Server Port</Label>
              <Input
                id="serverPort"
                type="number"
                value={settings.serverPort}
                onChange={(e) => updateSetting("serverPort", parseInt(e.target.value) || 4096)}
                min={1024}
                max={65535}
              />
              <p className="text-xs text-muted-foreground">
                The port used for the local AI server. Requires restart to take effect.
              </p>
            </div>

            <Separator />

            <div className="space-y-3">
              <Label>Theme</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Choose from {themeList.length} themes inspired by popular editors
              </p>

              {/* Light themes */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Sun className="h-3 w-3" />
                  <span>Light</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {themeList.filter(t => !t.isDark).map((theme) => {
                    const colors = THEMES[theme.id].colors;
                    return (
                      <button
                        key={theme.id}
                        onClick={() => setTheme(theme.id)}
                        className={cn(
                          "relative flex flex-col items-start p-2 rounded-md border transition-all",
                          "hover:border-primary/50",
                          currentTheme === theme.id
                            ? "border-primary ring-1 ring-primary"
                            : "border-border"
                        )}
                      >
                        {/* Theme color preview */}
                        <div className="flex gap-0.5 mb-1.5">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ background: `hsl(${colors.background})` }}
                          />
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ background: `hsl(${colors.primary})` }}
                          />
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ background: `hsl(${colors.accent})` }}
                          />
                        </div>
                        <span className="text-[10px] font-medium truncate w-full">
                          {theme.name}
                        </span>
                        {currentTheme === theme.id && (
                          <Check className="absolute top-1 right-1 h-3 w-3 text-primary" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Dark themes */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Moon className="h-3 w-3" />
                  <span>Dark</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {themeList.filter(t => t.isDark).map((theme) => {
                    const colors = THEMES[theme.id].colors;
                    return (
                      <button
                        key={theme.id}
                        onClick={() => setTheme(theme.id)}
                        className={cn(
                          "relative flex flex-col items-start p-2 rounded-md border transition-all",
                          "hover:border-primary/50",
                          currentTheme === theme.id
                            ? "border-primary ring-1 ring-primary"
                            : "border-border"
                        )}
                      >
                        {/* Theme color preview */}
                        <div className="flex gap-0.5 mb-1.5">
                          <div
                            className="w-3 h-3 rounded-full border border-white/10"
                            style={{ background: `hsl(${colors.background})` }}
                          />
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ background: `hsl(${colors.primary})` }}
                          />
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ background: `hsl(${colors.accent})` }}
                          />
                        </div>
                        <span className="text-[10px] font-medium truncate w-full">
                          {theme.name}
                        </span>
                        {currentTheme === theme.id && (
                          <Check className="absolute top-1 right-1 h-3 w-3 text-primary" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
