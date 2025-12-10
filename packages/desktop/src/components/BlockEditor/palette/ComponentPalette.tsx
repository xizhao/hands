/**
 * ComponentPalette - Draggable component palette
 */

import { useDrag } from "react-dnd";
import type { DragItem } from "../types";
import { cn } from "@/lib/utils";
import {
  SquaresFour,
  TextT,
  TextH,
  CursorClick,
  TextAa,
  Table,
  Code,
  Cards,
} from "@phosphor-icons/react";

interface ComponentPaletteProps {
  onAddNode: (nodeType: string) => void;
}

const PALETTE_ITEMS = [
  { type: "container", label: "Container", icon: SquaresFour, description: "Flex container" },
  { type: "text", label: "Text", icon: TextT, description: "Paragraph text" },
  { type: "heading", label: "Heading", icon: TextH, description: "Heading text" },
  { type: "button", label: "Button", icon: CursorClick, description: "Clickable button" },
  { type: "input", label: "Input", icon: TextAa, description: "Text input field" },
  { type: "card", label: "Card", icon: Cards, description: "Card container" },
  { type: "datatable", label: "DataTable", icon: Table, description: "Data table" },
  { type: "expression", label: "Expression", icon: Code, description: "JS expression" },
];

export function ComponentPalette({ onAddNode }: ComponentPaletteProps) {
  return (
    <div className="p-3">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
        Components
      </h3>
      <div className="space-y-1">
        {PALETTE_ITEMS.map((item) => (
          <PaletteItem
            key={item.type}
            type={item.type}
            label={item.label}
            icon={item.icon}
            description={item.description}
            onAdd={() => onAddNode(item.type)}
          />
        ))}
      </div>
    </div>
  );
}

interface PaletteItemProps {
  type: string;
  label: string;
  icon: React.ComponentType<{ weight?: "regular" | "duotone"; className?: string }>;
  description: string;
  onAdd: () => void;
}

function PaletteItem({ type, label, icon: Icon, description, onAdd }: PaletteItemProps) {
  const [{ isDragging }, drag] = useDrag({
    type: "palette",
    item: { type: "palette", nodeType: type } as DragItem,
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
    end: (_, monitor) => {
      // If dropped successfully
      if (monitor.didDrop()) {
        // The drop handling is done in the tree
      }
    },
  });

  return (
    <div
      ref={(node) => { drag(node); }}
      onClick={onAdd}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-md cursor-grab",
        "hover:bg-accent transition-colors",
        "border border-transparent hover:border-border",
        isDragging && "opacity-50 cursor-grabbing"
      )}
    >
      <Icon weight="duotone" className="h-5 w-5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground truncate">{description}</div>
      </div>
    </div>
  );
}
