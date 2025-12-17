/**
 * SettingsPanel - Project settings, secrets, and configuration
 */

import {
  CaretRight,
  Database,
  Eye,
  EyeSlash,
  FolderOpen,
  Gear,
  Globe,
  Key,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import { useState } from "react";
import { useRuntimeState } from "@/hooks/useRuntimeState";
import { useUpdateWorkbook, useWorkbook } from "@/hooks/useWorkbook";
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
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Configure how your workbook is deployed to production.
      </p>
      <div className="p-3 bg-muted/50 rounded-md text-center">
        <Globe weight="duotone" className="h-6 w-6 text-muted-foreground/50 mx-auto mb-2" />
        <div className="text-xs text-muted-foreground">Deployment coming soon</div>
      </div>
    </div>
  );
}
