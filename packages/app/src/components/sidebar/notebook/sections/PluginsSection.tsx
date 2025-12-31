/**
 * PluginsSection - Plugins section in sidebar
 *
 * Displays custom plugins (TSX components extending stdlib).
 */

import { cn } from "@/lib/utils";
import { PluginIcon } from "../components/icons";
import { listItemStyles } from "../components/SidebarItem";
import { SidebarEmptyState, SidebarSection } from "../components/SidebarSection";
import type { SidebarPlugin } from "../types";

interface PluginsSectionProps {
  /** Section expanded state */
  expanded: boolean;
  /** Toggle section */
  onToggle: () => void;
  /** Plugins list */
  plugins: SidebarPlugin[];
  /** Size variant */
  size?: "default" | "lg";
}

export function PluginsSection({ expanded, onToggle, plugins, size }: PluginsSectionProps) {
  const handlePluginClick = (pluginId: string) => {
    // TODO: Navigate to plugin source in editor
    console.log("[sidebar] plugin clicked:", pluginId);
  };

  return (
    <SidebarSection
      title="Plugins"
      type="plugins"
      count={plugins.length}
      expanded={expanded}
      onToggle={onToggle}
      onAdd={() => {
        // TODO: Create new plugin
        console.log("[sidebar] new plugin clicked");
      }}
      addTooltip="New plugin"
      size={size}
    >
      {plugins.length > 0 ? (
        plugins.map((plugin) => (
          <div key={plugin.id} className={cn(listItemStyles, "group")}>
            <PluginIcon />
            <button
              onClick={() => handlePluginClick(plugin.id)}
              className="flex-1 truncate text-left hover:underline"
            >
              {plugin.name}
            </button>
          </div>
        ))
      ) : (
        <SidebarEmptyState label="No plugins" />
      )}
    </SidebarSection>
  );
}
