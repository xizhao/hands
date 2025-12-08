import { memo } from "react";
import type { Permission } from "@/lib/api";
import { useRespondToPermission } from "@/hooks/useSession";
import { Button } from "@/components/ui/button";
import { Shield, Terminal, FileCode, Globe, Database, Check, X, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface PermissionDialogProps {
  sessionId: string;
  permission: Permission;
}

const PermissionIcon = ({ type }: { type: string }) => {
  const lowerType = type.toLowerCase();
  if (lowerType.includes("bash") || lowerType.includes("shell")) return <Terminal className="h-5 w-5" />;
  if (lowerType.includes("file") || lowerType.includes("write") || lowerType.includes("read")) return <FileCode className="h-5 w-5" />;
  if (lowerType.includes("web") || lowerType.includes("fetch")) return <Globe className="h-5 w-5" />;
  if (lowerType.includes("sql") || lowerType.includes("database")) return <Database className="h-5 w-5" />;
  return <Shield className="h-5 w-5" />;
};

export const PermissionDialog = memo(({ sessionId, permission }: PermissionDialogProps) => {
  const respondToPermission = useRespondToPermission(sessionId);
  const isPending = respondToPermission.isPending;

  const handleRespond = (response: "once" | "always" | "reject") => {
    respondToPermission.mutate({ permissionId: permission.id, response });
  };

  // Format metadata for display
  const metadataEntries = Object.entries(permission.metadata).filter(
    ([, value]) => typeof value === "string" || typeof value === "number"
  );

  return (
    <div className="mx-4 my-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 overflow-hidden">
      <div className="p-3 border-b border-yellow-500/20 bg-yellow-500/10">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-yellow-500/20 text-yellow-600 dark:text-yellow-400">
            <PermissionIcon type={permission.type} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-sm text-yellow-700 dark:text-yellow-300">
              Permission Required
            </h3>
            <p className="text-xs text-yellow-600/80 dark:text-yellow-400/80 truncate">
              {permission.title}
            </p>
          </div>
        </div>
      </div>

      {/* Details */}
      {metadataEntries.length > 0 && (
        <div className="p-2 border-b border-yellow-500/20 bg-background/50">
          <div className="space-y-1">
            {metadataEntries.slice(0, 3).map(([key, value]) => (
              <div key={key} className="flex text-xs">
                <span className="text-muted-foreground w-20 shrink-0 capitalize">
                  {key}:
                </span>
                <span className="font-mono text-foreground/80 truncate">
                  {String(value).length > 50 ? String(value).slice(0, 50) + "..." : String(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="p-2 flex items-center gap-2 bg-muted/30">
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "flex-1 h-8 text-xs gap-1.5",
            "text-red-600 hover:text-red-700 hover:bg-red-500/10"
          )}
          disabled={isPending}
          onClick={() => handleRespond("reject")}
        >
          <X className="h-3.5 w-3.5" />
          Deny
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "flex-1 h-8 text-xs gap-1.5",
            "text-blue-600 hover:text-blue-700 hover:bg-blue-500/10"
          )}
          disabled={isPending}
          onClick={() => handleRespond("once")}
        >
          <Check className="h-3.5 w-3.5" />
          Once
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "flex-1 h-8 text-xs gap-1.5",
            "text-green-600 hover:text-green-700 hover:bg-green-500/10"
          )}
          disabled={isPending}
          onClick={() => handleRespond("always")}
        >
          <CheckCheck className="h-3.5 w-3.5" />
          Always
        </Button>
      </div>
    </div>
  );
});

PermissionDialog.displayName = "PermissionDialog";
