/**
 * NewWorkbookModal - Modal for creating new workbooks with parameters and templates
 *
 * Features:
 * - Name and description inputs
 * - Template library for quick start
 * - Preview of what each template provides
 */

import {
  ChartBar,
  CurrencyDollar,
  File,
  Globe,
  Lightning,
  ShoppingCart,
  Sparkle,
  Users,
} from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Template definitions
const templates = [
  {
    id: "blank",
    name: "Blank",
    description: "Start from scratch with an empty workbook",
    icon: File,
    color: "text-muted-foreground",
    bgColor: "bg-muted/50",
    popular: false,
  },
  {
    id: "data-analysis",
    name: "Data Analysis",
    description: "Pre-configured for exploratory data analysis with sample queries",
    icon: ChartBar,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    popular: true,
  },
  {
    id: "sales-dashboard",
    name: "Sales Dashboard",
    description: "Track revenue, customers, and sales metrics",
    icon: CurrencyDollar,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    popular: true,
  },
  {
    id: "user-analytics",
    name: "User Analytics",
    description: "Analyze user behavior, retention, and engagement",
    icon: Users,
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
    popular: false,
  },
  {
    id: "ecommerce",
    name: "E-commerce",
    description: "Order tracking, inventory, and customer insights",
    icon: ShoppingCart,
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
    popular: false,
  },
  {
    id: "web-analytics",
    name: "Web Analytics",
    description: "Page views, sessions, and traffic analysis",
    icon: Globe,
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/10",
    popular: false,
  },
];

interface NewWorkbookModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string, description?: string, templateId?: string) => void;
  isCreating?: boolean;
}

export function NewWorkbookModal({
  open,
  onOpenChange,
  onCreate,
  isCreating = false,
}: NewWorkbookModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string>("blank");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = name.trim() || "Untitled Workbook";
    onCreate(
      finalName,
      description.trim() || undefined,
      selectedTemplate !== "blank" ? selectedTemplate : undefined,
    );
    // Reset form
    setName("");
    setDescription("");
    setSelectedTemplate("blank");
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    // Auto-fill name if empty and selecting a non-blank template
    if (!name.trim() && templateId !== "blank") {
      const template = templates.find((t) => t.id === templateId);
      if (template) {
        setName(template.name);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Create New Workbook</DialogTitle>
          <DialogDescription>
            Choose a template to get started quickly, or start from scratch.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Template Selection */}
          <div className="space-y-3">
            <label className="text-sm font-medium">Template</label>
            <div className="grid grid-cols-3 gap-2">
              {templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => handleTemplateSelect(template.id)}
                  className={cn(
                    "relative flex flex-col items-center gap-2 p-3 rounded-lg text-center",
                    "border transition-all duration-150",
                    selectedTemplate === template.id
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "border-border/50 hover:border-border hover:bg-accent/50",
                  )}
                >
                  {template.popular && (
                    <div className="absolute -top-1.5 -right-1.5">
                      <Sparkle weight="fill" className="h-3.5 w-3.5 text-yellow-500" />
                    </div>
                  )}
                  <div className={cn("p-2 rounded-md", template.bgColor)}>
                    <template.icon weight="duotone" className={cn("h-5 w-5", template.color)} />
                  </div>
                  <div>
                    <div className="text-xs font-medium">{template.name}</div>
                  </div>
                </button>
              ))}
            </div>
            {/* Selected template description */}
            <p className="text-xs text-muted-foreground px-1">
              {templates.find((t) => t.id === selectedTemplate)?.description}
            </p>
          </div>

          {/* Name Input */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Workbook"
              autoFocus
            />
          </div>

          {/* Description Input */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Description <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this workbook for?"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isCreating}>
              {isCreating ? (
                <>
                  <Lightning weight="fill" className="h-4 w-4 mr-2 animate-pulse" />
                  Creating...
                </>
              ) : (
                "Create Workbook"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
