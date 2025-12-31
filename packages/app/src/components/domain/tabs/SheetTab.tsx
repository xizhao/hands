/**
 * SheetTab - Table data browser with relations panel
 *
 * Combines the table editor with a collapsible relations sidebar.
 */

import { useState, useCallback } from "react";
import { TableEditor } from "@hands/editor/table-editor";
import { useTRPCReady } from "@/hooks/useTRPC";
import { useTableEditorProvider } from "@/hooks/useTableEditorProvider";
import { GitBranch, ArrowRight, ChevronRight, Database } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Domain, DomainForeignKey } from "../../sidebar/domain/types";

interface SheetTabProps {
  domain: Domain;
}

export function SheetTab({ domain }: SheetTabProps) {
  const { ready, isLoading } = useTRPCReady();
  const [showRelations, setShowRelations] = useState(false);

  // Sort state
  const [sortColumn, setSortColumn] = useState<string | undefined>(undefined);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Handle sort changes
  const handleSortChange = useCallback(
    (column: string | null, direction: "asc" | "desc") => {
      setSortColumn(column ?? undefined);
      setSortDirection(direction);
    },
    []
  );

  // Create data provider
  const dataProvider = useTableEditorProvider({
    source: "local",
    table: domain.id,
    sort: sortColumn,
    sortDirection,
  });

  // Relations data
  const foreignKeys = domain.foreignKeys || [];
  const relatedDomains = domain.relatedDomains || [];
  const hasRelations = foreignKeys.length > 0 || relatedDomains.length > 0;

  if (!ready) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        {isLoading ? "Connecting to runtime..." : "Waiting for runtime..."}
      </div>
    );
  }

  return (
    <div className="h-full flex bg-background">
      {/* Main table editor */}
      <div className="flex-1 min-w-0">
        <TableEditor
          dataProvider={dataProvider}
          tableName={domain.id}
          className="h-full"
          editable={true}
          onSortChange={handleSortChange}
        />
      </div>

      {/* Relations toggle button */}
      {hasRelations && (
        <button
          onClick={() => setShowRelations(!showRelations)}
          className={cn(
            "flex-shrink-0 w-6 flex items-center justify-center",
            "border-l border-border/50 hover:bg-muted/50 transition-colors",
            showRelations && "bg-muted/30"
          )}
          title={showRelations ? "Hide relations" : "Show relations"}
        >
          <ChevronRight
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              showRelations && "rotate-180"
            )}
          />
        </button>
      )}

      {/* Relations panel */}
      {showRelations && hasRelations && (
        <div className="w-64 flex-shrink-0 border-l border-border/50 overflow-auto p-3 bg-muted/20">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <GitBranch className="h-3.5 w-3.5" />
              <span>Relations</span>
            </div>

            {/* Foreign Keys (Outgoing) */}
            {foreignKeys.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                  References
                </h4>
                {foreignKeys.map((fk, i) => (
                  <ForeignKeyItem key={i} foreignKey={fk} />
                ))}
              </div>
            )}

            {/* Related Domains (Incoming) */}
            {relatedDomains.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                  Referenced By
                </h4>
                {relatedDomains
                  .filter((rd) => !foreignKeys.some((fk) => fk.referencedTable === rd))
                  .map((relatedDomain) => (
                    <RelatedDomainItem key={relatedDomain} name={relatedDomain} />
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ForeignKeyItem({ foreignKey }: { foreignKey: DomainForeignKey }) {
  return (
    <div className="rounded-md border border-border/50 p-2 text-xs bg-background">
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">{foreignKey.column}</span>
        <ArrowRight className="h-3 w-3 text-muted-foreground/50" />
        <span className="font-medium">{foreignKey.referencedTable}</span>
      </div>
    </div>
  );
}

function RelatedDomainItem({ name }: { name: string }) {
  const displayName = name
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  return (
    <div className="rounded-md border border-border/50 p-2 text-xs bg-background">
      <div className="flex items-center gap-1.5">
        <Database className="h-3 w-3 text-muted-foreground" />
        <span className="font-medium">{displayName}</span>
      </div>
    </div>
  );
}

export default SheetTab;
