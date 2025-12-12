import { registry } from "../registry.js";

// ============================================
// Runtime Components - for RSC serialization
// ============================================

// UI Components - shadcn/ui
export { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "./components/ui/accordion.js";
export { AlertDialog, AlertDialogPortal, AlertDialogOverlay, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel } from "./components/ui/alert-dialog.js";
export { Alert, AlertTitle, AlertDescription } from "./components/ui/alert.js";
export { AspectRatio } from "./components/ui/aspect-ratio.js";
export { Avatar, AvatarImage, AvatarFallback } from "./components/ui/avatar.js";
export { Badge, badgeVariants } from "./components/ui/badge.js";
export { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator, BreadcrumbEllipsis } from "./components/ui/breadcrumb.js";
export { Button, buttonVariants } from "./components/ui/button.js";
export { ButtonGroup, ButtonGroupSeparator, ButtonGroupText, buttonGroupVariants } from "./components/ui/button-group.js";
export { Calendar } from "./components/ui/calendar.js";
export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent } from "./components/ui/card.js";
export { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext } from "./components/ui/carousel.js";
export { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, ChartStyle } from "./components/ui/chart.js";
export type { ChartConfig } from "./components/ui/chart.js";
export { Checkbox } from "./components/ui/checkbox.js";
export { Collapsible, CollapsibleTrigger, CollapsibleContent } from "./components/ui/collapsible.js";
export { Command, CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandShortcut, CommandSeparator } from "./components/ui/command.js";
export { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuCheckboxItem, ContextMenuRadioItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuShortcut, ContextMenuGroup, ContextMenuPortal, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuRadioGroup } from "./components/ui/context-menu.js";
export { Dialog, DialogPortal, DialogOverlay, DialogTrigger, DialogClose, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from "./components/ui/dialog.js";
export { Drawer, DrawerPortal, DrawerOverlay, DrawerTrigger, DrawerClose, DrawerContent, DrawerHeader, DrawerFooter, DrawerTitle, DrawerDescription } from "./components/ui/drawer.js";
export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuCheckboxItem, DropdownMenuRadioItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuGroup, DropdownMenuPortal, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuRadioGroup } from "./components/ui/dropdown-menu.js";
export { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent, EmptyMedia } from "./components/ui/empty.js";
export { Field, FieldLabel, FieldDescription, FieldError, FieldGroup, FieldLegend, FieldSeparator, FieldSet, FieldContent, FieldTitle } from "./components/ui/field.js";
export { Form, FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage, useFormField } from "./components/ui/form.js";
export { HoverCard, HoverCardTrigger, HoverCardContent } from "./components/ui/hover-card.js";
export { Input } from "./components/ui/input.js";
export { InputGroup, InputGroupInput, InputGroupText } from "./components/ui/input-group.js";
export { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from "./components/ui/input-otp.js";
export { Item, ItemMedia, ItemContent, ItemActions, ItemGroup, ItemSeparator, ItemTitle, ItemDescription, ItemHeader, ItemFooter } from "./components/ui/item.js";
export { Kbd } from "./components/ui/kbd.js";
export { Label } from "./components/ui/label.js";
export { Menubar, MenubarMenu, MenubarTrigger, MenubarContent, MenubarItem, MenubarSeparator, MenubarLabel, MenubarCheckboxItem, MenubarRadioGroup, MenubarRadioItem, MenubarPortal, MenubarSubContent, MenubarSubTrigger, MenubarGroup, MenubarSub, MenubarShortcut } from "./components/ui/menubar.js";
export { NavigationMenu, NavigationMenuList, NavigationMenuItem, NavigationMenuContent, NavigationMenuTrigger, NavigationMenuLink, NavigationMenuIndicator, NavigationMenuViewport, navigationMenuTriggerStyle } from "./components/ui/navigation-menu.js";
export { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationPrevious, PaginationNext, PaginationEllipsis } from "./components/ui/pagination.js";
export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor } from "./components/ui/popover.js";
export { Progress } from "./components/ui/progress.js";
export { RadioGroup, RadioGroupItem } from "./components/ui/radio-group.js";
export { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "./components/ui/resizable.js";
export { ScrollArea, ScrollBar } from "./components/ui/scroll-area.js";
export { Select, SelectGroup, SelectValue, SelectTrigger, SelectContent, SelectLabel, SelectItem, SelectSeparator, SelectScrollUpButton, SelectScrollDownButton } from "./components/ui/select.js";
export { Separator } from "./components/ui/separator.js";
export { Sheet, SheetPortal, SheetOverlay, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription } from "./components/ui/sheet.js";
export { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupAction, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInput, SidebarInset, SidebarMenu, SidebarMenuAction, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarMenuSkeleton, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem, SidebarProvider, SidebarRail, SidebarSeparator, SidebarTrigger, useSidebar } from "./components/ui/sidebar.js";
export { Skeleton } from "./components/ui/skeleton.js";
export { Slider } from "./components/ui/slider.js";
export { Toaster } from "./components/ui/sonner.js";
export { Spinner } from "./components/ui/spinner.js";
export { Switch } from "./components/ui/switch.js";
export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption } from "./components/ui/table.js";
export { Tabs, TabsList, TabsTrigger, TabsContent } from "./components/ui/tabs.js";
export { Textarea } from "./components/ui/textarea.js";
export { ToggleGroup, ToggleGroupItem } from "./components/ui/toggle-group.js";
export { Toggle, toggleVariants } from "./components/ui/toggle.js";
export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "./components/ui/tooltip.js";

// Data Components
export { MetricCard } from "./components/data/metric-card.js";
export { DataTable } from "./components/data/data-table.js";
export type { DataTableProps, DataTableColumn } from "./components/data/data-table.js";

// Chart Components
export { BarChart } from "./components/charts/bar-chart.js";
export { LineChart } from "./components/charts/line-chart.js";
export type { BarChartProps } from "./components/charts/bar-chart.js";
export type { LineChartProps } from "./components/charts/line-chart.js";

// ============================================
// Component Metadata Registry - for CLI
// ============================================

export interface ComponentMeta {
  name: string;
  category: string;
  description: string;
  files: string[];
  dependencies: string[];
  /** Plate KEYS value for block/inline types */
  plateKey?: string;
  /** Lucide icon name */
  icon?: string;
  /** Search keywords */
  keywords?: string[];
}

export interface CategoryMeta {
  name: string;
  description: string;
}

export interface Registry {
  name: string;
  version: string;
  components: Record<string, ComponentMeta>;
  categories: Record<string, CategoryMeta>;
}

// Export typed registry
export const componentRegistry = registry as Registry;

// Helper functions for querying

export function listComponents(category?: string): Array<{ key: string } & ComponentMeta> {
  return Object.entries(componentRegistry.components)
    .filter(([_, comp]) => !category || comp.category === category)
    .map(([key, comp]) => ({ key, ...comp }));
}

export function getComponent(name: string): (ComponentMeta & { key: string }) | undefined {
  const comp = componentRegistry.components[name];
  return comp ? { key: name, ...comp } : undefined;
}

export function searchComponents(query: string): Array<{ key: string } & ComponentMeta> {
  const q = query.toLowerCase();
  return Object.entries(componentRegistry.components)
    .filter(([key, comp]) =>
      key.includes(q) ||
      comp.name.toLowerCase().includes(q) ||
      comp.description.toLowerCase().includes(q) ||
      comp.category.includes(q)
    )
    .map(([key, comp]) => ({ key, ...comp }));
}

export function listCategories(): Array<{ key: string } & CategoryMeta> {
  return Object.entries(componentRegistry.categories)
    .map(([key, cat]) => ({ key, ...cat }));
}

export function getCategory(name: string): CategoryMeta | undefined {
  return componentRegistry.categories[name];
}
