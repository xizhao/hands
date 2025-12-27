/**
 * SettingsPanel - Project settings, secrets, and configuration
 */

import {
  ArrowSquareOut,
  CaretRight,
  Check,
  CircleNotch,
  Database,
  Eye,
  EyeSlash,
  FolderOpen,
  Gear,
  Globe,
  Key,
  Plus,
  Rocket,
  Trash,
  Warning,
} from "@phosphor-icons/react";
import { useState } from "react";
import { useRuntimeState } from "@/hooks/useRuntimeState";
import { useUpdateWorkbook, useWorkbook } from "@/hooks/useWorkbook";
import { trpc } from "@/hooks/useTRPC";
import { cn } from "@/lib/utils";

type SettingsSection = "general" | "secrets" | "database" | "deployment";

export function SettingsPanel() {
  const { workbookId: activeWorkbookId } = useRuntimeState();
  const { data: _workbook } = useWorkbook(activeWorkbookId);
  const [activeSection, setActiveSection] = useState<SettingsSection | null>(null);

  const sections = [
    { id: "general" as const, label: "General", icon: Gear, description: "Name, description" },
    { id: "secrets" as const, label: "Secrets", icon: Key, description: "Environment variables" },
    {
      id: "database" as const,
      label: "Database",
      icon: Database,
      description: "Connection settings",
    },
    {
      id: "deployment" as const,
      label: "Deployment",
      icon: Globe,
      description: "Production config",
    },
  ];

  if (activeSection) {
    return (
      <div className="flex flex-col h-full">
        {/* Section header */}
        <div className="px-3 py-2 border-b border-border">
          <button
            onClick={() => setActiveSection(null)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back
          </button>
        </div>

        {/* Section content */}
        <div className="flex-1 overflow-y-auto p-3">
          {activeSection === "general" && <GeneralSettings />}
          {activeSection === "secrets" && <SecretsSettings />}
          {activeSection === "database" && <DatabaseSettings />}
          {activeSection === "deployment" && <DeploymentSettings />}
        </div>
      </div>
    );
  }

  return (
    <div className="p-2">
      <div className="space-y-1">
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => setActiveSection(section.id)}
            className={cn(
              "w-full flex items-center gap-2 px-2 py-2 rounded-md text-left",
              "text-sm text-foreground hover:bg-accent transition-colors",
            )}
          >
            <section.icon weight="duotone" className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <div>{section.label}</div>
              <div className="text-xs text-muted-foreground">{section.description}</div>
            </div>
            <CaretRight weight="bold" className="h-4 w-4 text-muted-foreground/50" />
          </button>
        ))}
      </div>
    </div>
  );
}

function GeneralSettings() {
  const { workbookId: activeWorkbookId } = useRuntimeState();
  const { data: workbook } = useWorkbook(activeWorkbookId);
  const updateWorkbook = useUpdateWorkbook();

  const handleOpenInFinder = async () => {
    if (workbook?.directory) {
      try {
        const { open } = await import("@tauri-apps/plugin-shell");
        await open(workbook.directory);
      } catch (err) {
        console.error("Failed to open directory:", err);
      }
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-medium text-muted-foreground">Name</label>
        <input
          type="text"
          value={workbook?.name ?? ""}
          onChange={(e) => {
            if (workbook) {
              updateWorkbook.mutate({
                ...workbook,
                name: e.target.value,
                updated_at: Date.now(),
              });
            }
          }}
          className="mt-1 w-full px-2 py-1.5 text-sm bg-muted rounded-md border border-border focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground">Directory</label>
        <div className="mt-1 flex items-center gap-2">
          <div className="flex-1 px-2 py-1.5 text-sm text-muted-foreground bg-muted/50 rounded-md font-mono truncate">
            {workbook?.directory ?? "—"}
          </div>
          <button
            onClick={handleOpenInFinder}
            disabled={!workbook?.directory}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              workbook?.directory
                ? "text-muted-foreground hover:text-foreground hover:bg-accent"
                : "text-muted-foreground/30 cursor-not-allowed",
            )}
            title="Open in Finder"
          >
            <FolderOpen weight="duotone" className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function SecretsSettings() {
  const [secrets, setSecrets] = useState<{ key: string; value: string; visible: boolean }[]>([
    // Mock data - would come from workbook config
  ]);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  const addSecret = () => {
    if (newKey && newValue) {
      setSecrets([...secrets, { key: newKey, value: newValue, visible: false }]);
      setNewKey("");
      setNewValue("");
    }
  };

  const removeSecret = (index: number) => {
    setSecrets(secrets.filter((_, i) => i !== index));
  };

  const toggleVisibility = (index: number) => {
    setSecrets(secrets.map((s, i) => (i === index ? { ...s, visible: !s.visible } : s)));
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Environment variables available to your workbook at runtime.
      </p>

      {/* Existing secrets */}
      {secrets.length > 0 && (
        <div className="space-y-2">
          {secrets.map((secret, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-mono text-foreground">{secret.key}</div>
                <div className="text-xs font-mono text-muted-foreground truncate">
                  {secret.visible ? secret.value : "••••••••"}
                </div>
              </div>
              <button
                onClick={() => toggleVisibility(idx)}
                className="p-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                {secret.visible ? (
                  <EyeSlash weight="duotone" className="h-3 w-3" />
                ) : (
                  <Eye weight="duotone" className="h-3 w-3" />
                )}
              </button>
              <button
                onClick={() => removeSecret(idx)}
                className="p-1 text-muted-foreground hover:text-red-400 transition-colors"
              >
                <Trash weight="duotone" className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add new secret */}
      <div className="space-y-2 pt-2 border-t border-border">
        <input
          type="text"
          placeholder="KEY_NAME"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))}
          className="w-full px-2 py-1.5 text-xs font-mono bg-muted rounded-md border border-border focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <input
          type="password"
          placeholder="Value"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          className="w-full px-2 py-1.5 text-xs font-mono bg-muted rounded-md border border-border focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          onClick={addSecret}
          disabled={!newKey || !newValue}
          className={cn(
            "flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors",
            newKey && newValue
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted text-muted-foreground cursor-not-allowed",
          )}
        >
          <Plus weight="bold" className="h-3 w-3" />
          Add Secret
        </button>
      </div>
    </div>
  );
}

function DatabaseSettings() {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Database connection settings for your workbook.
      </p>
      <div className="p-3 bg-muted/50 rounded-md">
        <div className="text-xs text-muted-foreground">
          Database settings are managed automatically by the runtime.
        </div>
      </div>
    </div>
  );
}

function DeploymentSettings() {
  const publishMutation = trpc.deploy.publish.useMutation();
  const statusQuery = trpc.deploy.status.useQuery(undefined, {
    staleTime: 30000, // Cache for 30s to avoid slow wrangler calls
  });

  const handleDeploy = () => {
    publishMutation.mutate(undefined);
  };

  const openDeployedUrl = async () => {
    const url = publishMutation.data?.url || statusQuery.data?.url;
    if (url) {
      try {
        const { open } = await import("@tauri-apps/plugin-shell");
        await open(url);
      } catch (err) {
        // Fallback for web
        window.open(url, "_blank");
      }
    }
  };

  const isDeploying = publishMutation.isPending;
  const deployError = publishMutation.error?.message || publishMutation.data?.error;
  const deploySuccess = publishMutation.isSuccess && publishMutation.data?.success;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Deploy your workbook to Cloudflare Workers for public access.
      </p>

      {/* Current deployment status */}
      {statusQuery.data?.deployed && !deploySuccess && (
        <div className="p-3 bg-muted/50 rounded-md">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Globe weight="duotone" className="h-4 w-4 text-green-500" />
            <span>Currently deployed</span>
          </div>
          {statusQuery.data.url && (
            <button
              onClick={openDeployedUrl}
              className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline"
            >
              {statusQuery.data.url}
              <ArrowSquareOut weight="bold" className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      {/* Deploy success message */}
      {deploySuccess && (
        <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-md">
          <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
            <Check weight="bold" className="h-4 w-4" />
            <span>Deployed successfully!</span>
          </div>
          {publishMutation.data?.url && (
            <button
              onClick={openDeployedUrl}
              className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline"
            >
              {publishMutation.data.url}
              <ArrowSquareOut weight="bold" className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      {/* Deploy error message */}
      {deployError && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-md">
          <div className="flex items-start gap-2 text-xs text-red-600 dark:text-red-400">
            <Warning weight="bold" className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{deployError}</span>
          </div>
        </div>
      )}

      {/* Deploy button */}
      <button
        onClick={handleDeploy}
        disabled={isDeploying}
        className={cn(
          "w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
          isDeploying
            ? "bg-muted text-muted-foreground cursor-not-allowed"
            : "bg-primary text-primary-foreground hover:bg-primary/90"
        )}
      >
        {isDeploying ? (
          <>
            <CircleNotch weight="bold" className="h-4 w-4 animate-spin" />
            Deploying...
          </>
        ) : (
          <>
            <Rocket weight="duotone" className="h-4 w-4" />
            {statusQuery.data?.deployed ? "Redeploy" : "Deploy to Cloudflare"}
          </>
        )}
      </button>

      {/* Note about CF token */}
      <p className="text-xs text-muted-foreground/70">
        Requires <code className="px-1 py-0.5 bg-muted rounded text-[10px]">HANDS_CF_TOKEN</code> environment variable.
      </p>
    </div>
  );
}
