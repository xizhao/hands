/**
 * DomainView - Content wrapper for domain tabs
 *
 * Simple wrapper that renders the active tab content.
 * Tabs are handled by ContentHeader.
 */

import type { DomainTab, Domain } from "../sidebar/domain/types";

interface DomainViewProps {
  domain: Domain;
  activeTab: DomainTab;
  onTabChange: (tab: DomainTab) => void;
  children: React.ReactNode;
}

export function DomainView({ children }: DomainViewProps) {
  return <div className="h-full overflow-hidden">{children}</div>;
}

export default DomainView;
