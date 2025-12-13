import { registry, previews } from "../registry.generated.js";

export { previews };

// ============================================
// Runtime Components - for RSC serialization
// ============================================

export type { BarChartProps } from "./components/charts/bar-chart.js";
// Chart Components
export { BarChart } from "./components/charts/bar-chart.js";
export type { LineChartProps } from "./components/charts/line-chart.js";
export { LineChart } from "./components/charts/line-chart.js";
export type { DataTableColumn, DataTableProps } from "./components/data/data-table.js";
export { DataTable } from "./components/data/data-table.js";
// Data Components
export { MetricCard } from "./components/data/metric-card.js";
// UI Components - shadcn/ui
export {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./components/ui/accordion.js";
export { Alert, AlertDescription, AlertTitle } from "./components/ui/alert.js";
export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./components/ui/alert-dialog.js";
export { AspectRatio } from "./components/ui/aspect-ratio.js";
export { Avatar, AvatarFallback, AvatarImage } from "./components/ui/avatar.js";
export { Badge, badgeVariants } from "./components/ui/badge.js";
export {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./components/ui/breadcrumb.js";
export { Button, buttonVariants } from "./components/ui/button.js";
export {
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
  buttonGroupVariants,
} from "./components/ui/button-group.js";
export { Calendar } from "./components/ui/calendar.js";
export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./components/ui/card.js";
export {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "./components/ui/carousel.js";
export type { ChartConfig } from "./components/ui/chart.js";
export {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,
  ChartTooltip,
  ChartTooltipContent,
} from "./components/ui/chart.js";
export { Checkbox } from "./components/ui/checkbox.js";
export {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./components/ui/collapsible.js";
export {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "./components/ui/command.js";
export {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuPortal,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "./components/ui/context-menu.js";
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "./components/ui/dialog.js";
export {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
  DrawerTrigger,
} from "./components/ui/drawer.js";
export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./components/ui/dropdown-menu.js";
export {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./components/ui/empty.js";
export {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
} from "./components/ui/field.js";
export {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useFormField,
} from "./components/ui/form.js";
export { HoverCard, HoverCardContent, HoverCardTrigger } from "./components/ui/hover-card.js";
export { Input } from "./components/ui/input.js";
export { InputGroup, InputGroupInput, InputGroupText } from "./components/ui/input-group.js";
export {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "./components/ui/input-otp.js";
export {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemHeader,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "./components/ui/item.js";
export { Kbd } from "./components/ui/kbd.js";
export { Label } from "./components/ui/label.js";
export {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarGroup,
  MenubarItem,
  MenubarLabel,
  MenubarMenu,
  MenubarPortal,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from "./components/ui/menubar.js";
export {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuIndicator,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavigationMenuViewport,
  navigationMenuTriggerStyle,
} from "./components/ui/navigation-menu.js";
export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "./components/ui/pagination.js";
export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "./components/ui/popover.js";
export { Progress } from "./components/ui/progress.js";
export { RadioGroup, RadioGroupItem } from "./components/ui/radio-group.js";
export { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./components/ui/resizable.js";
export { ScrollArea, ScrollBar } from "./components/ui/scroll-area.js";
export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select.js";
export { Separator } from "./components/ui/separator.js";
export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
} from "./components/ui/sheet.js";
export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "./components/ui/sidebar.js";
export { Skeleton } from "./components/ui/skeleton.js";
export { Slider } from "./components/ui/slider.js";
export { Toaster } from "./components/ui/sonner.js";
export { Spinner } from "./components/ui/spinner.js";
export { Switch } from "./components/ui/switch.js";
export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "./components/ui/table.js";
export { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs.js";
export { Textarea } from "./components/ui/textarea.js";
export { Toggle, toggleVariants } from "./components/ui/toggle.js";
export { ToggleGroup, ToggleGroupItem } from "./components/ui/toggle-group.js";
export {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./components/ui/tooltip.js";

// ============================================
// Component Metadata Registry - for CLI
// ============================================

export interface ComponentMeta {
  name: string;
  category: string;
  description: string;
  files: string[];
  dependencies: string[];
  /** Lucide icon name */
  icon?: string;
  /** Search keywords */
  keywords?: string[];
  /** JSX example code */
  example?: string;
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
// Use type assertion to handle the `as const` readonly arrays from registry.ts
export const componentRegistry = registry as unknown as Registry;

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
    .filter(
      ([key, comp]) =>
        key.includes(q) ||
        comp.name.toLowerCase().includes(q) ||
        comp.description.toLowerCase().includes(q) ||
        comp.category.includes(q),
    )
    .map(([key, comp]) => ({ key, ...comp }));
}

export function listCategories(): Array<{ key: string } & CategoryMeta> {
  return Object.entries(componentRegistry.categories).map(([key, cat]) => ({ key, ...cat }));
}

export function getCategory(name: string): CategoryMeta | undefined {
  return componentRegistry.categories[name];
}
