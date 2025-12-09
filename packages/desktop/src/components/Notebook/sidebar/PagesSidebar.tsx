/**
 * PagesSidebar - Navigation sidebar for notebook pages
 *
 * Features:
 * - List of pages in the notebook
 * - Add new page button
 * - Magnetic zoom effect on hover (like macOS dock)
 * - Minimal design
 */

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { FileText, Plus } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface PagesSidebarProps {
  collapsed?: boolean;
}

interface Page {
  id: string;
  title: string;
  icon?: string;
}

// Mock pages for now - will be replaced with real data
const MOCK_PAGES: Page[] = [
  { id: "1", title: "Getting Started" },
  { id: "2", title: "Data Analysis" },
  { id: "3", title: "SQL Queries" },
];

export function PagesSidebar({ collapsed = false }: PagesSidebarProps) {
  const [pages] = useState<Page[]>(MOCK_PAGES);
  const [activePage, setActivePage] = useState<string>("1");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const handleAddPage = () => {
    // TODO: Implement add page
    console.log("Add new page");
  };

  // Calculate magnetic zoom scale based on distance from hovered item
  const getScale = useCallback((index: number) => {
    if (hoveredIndex === null) return 1;
    const distance = Math.abs(index - hoveredIndex);
    if (distance === 0) return 1.06; // Hovered item - subtle
    if (distance === 1) return 1.02; // Adjacent items
    return 1; // Far items
  }, [hoveredIndex]);

  return (
    <TooltipProvider delayDuration={0}>
      <div className="space-y-0">
        {/* Pages list with magnetic zoom */}
        {pages.map((page, index) => (
          <PageItem
            key={page.id}
            page={page}
            active={activePage === page.id}
            scale={getScale(index)}
            collapsed={collapsed}
            onClick={() => setActivePage(page.id)}
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
          />
        ))}

        {/* Add page - ultra minimal, just a + */}
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleAddPage}
                className="w-full flex items-center justify-center p-1.5 text-muted-foreground/40 hover:text-muted-foreground/70 transition-all"
              >
                <Plus className="h-3 w-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Add page</p>
            </TooltipContent>
          </Tooltip>
        ) : (
          <button
            onClick={handleAddPage}
            className="flex items-center gap-1.5 py-0.5 text-[11px] text-muted-foreground/40 hover:text-muted-foreground/70 transition-all mt-1"
          >
            <Plus className="h-3 w-3" />
            <span>New</span>
          </button>
        )}
      </div>
    </TooltipProvider>
  );
}

interface PageItemProps {
  page: Page;
  active: boolean;
  scale: number;
  collapsed: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function PageItem({
  page,
  active,
  scale,
  collapsed,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: PageItemProps) {
  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            style={{ transform: `scale(${scale})` }}
            className={cn(
              "w-full flex items-center justify-center p-1.5 transition-all duration-150 origin-left",
              active
                ? "text-foreground"
                : "text-muted-foreground/70 hover:text-foreground"
            )}
          >
            <FileText className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">
          <p>{page.title}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <button
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ transform: `scale(${scale})` }}
      className={cn(
        "w-full flex items-center gap-2 py-0.5 text-[13px] transition-all duration-150 origin-left group",
        active
          ? "text-foreground font-medium"
          : "text-muted-foreground/70 hover:text-foreground"
      )}
    >
      <span className="flex-1 truncate text-left">{page.title}</span>
    </button>
  );
}
