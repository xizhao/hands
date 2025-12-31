/**
 * Domain Route - /domains/:domainId
 *
 * Tabbed view for a domain (table as first-class entity).
 * Supports tabs via search params: ?tab=page|sheet|actions
 */

import { createFileRoute } from "@tanstack/react-router";
import { DomainView } from "@/components/domain/DomainView";
import { PageTab } from "@/components/domain/tabs/PageTab";
import { SheetTab } from "@/components/domain/tabs/SheetTab";
import { ActionsTab } from "@/components/domain/tabs/ActionsTab";
import { useDomainData } from "@/components/sidebar/domain/hooks/useDomainData";
import type { DomainTab } from "@/components/sidebar/domain/types";

export const Route = createFileRoute("/_notebook/domains/$domainId")({
  component: DomainPage,
  validateSearch: (search: Record<string, unknown>): { tab: DomainTab } => {
    const tab = search.tab as string;
    if (tab === "page" || tab === "sheet" || tab === "actions") {
      return { tab };
    }
    return { tab: "page" };
  },
});

function DomainPage() {
  const { domainId } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();

  // Get domain data
  const { domains } = useDomainData();
  const domain = domains.find((d) => d.id === domainId);

  // Handle tab change
  const handleTabChange = (newTab: DomainTab) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    navigate({ search: { tab: newTab } } as any);
  };

  // Domain not found
  if (!domain) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <p className="text-lg font-medium">Domain not found</p>
          <p className="text-sm mt-1">Table "{domainId}" doesn't exist</p>
        </div>
      </div>
    );
  }

  // Render tab content based on current tab
  let tabContent: React.ReactNode;
  if (tab === "page") {
    tabContent = <PageTab domain={domain} />;
  } else if (tab === "actions") {
    tabContent = <ActionsTab domain={domain} />;
  } else {
    tabContent = <SheetTab domain={domain} />;
  }

  return (
    <DomainView
      domain={domain}
      activeTab={tab}
      onTabChange={handleTabChange}
    >
      {tabContent}
    </DomainView>
  );
}
