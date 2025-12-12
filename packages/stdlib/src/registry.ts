// Auto-generated from registry.json - DO NOT EDIT DIRECTLY
export const registry = {
  "$schema": "https://hands.dev/schema/registry.json",
  "name": "@hands/stdlib",
  "version": "0.1.0",
  "components": {
    "paragraph": {
      "name": "Text",
      "category": "blocks",
      "description": "Plain text.",
      "plateKey": "p",
      "icon": "pilcrow",
      "keywords": ["paragraph", "text"],
      "files": [],
      "dependencies": []
    },
    "heading-1": {
      "name": "Heading 1",
      "category": "blocks",
      "description": "Large section heading.",
      "plateKey": "h1",
      "icon": "heading-1",
      "keywords": ["title", "h1", "heading"],
      "files": [],
      "dependencies": []
    },
    "heading-2": {
      "name": "Heading 2",
      "category": "blocks",
      "description": "Medium section heading.",
      "plateKey": "h2",
      "icon": "heading-2",
      "keywords": ["subtitle", "h2", "heading"],
      "files": [],
      "dependencies": []
    },
    "heading-3": {
      "name": "Heading 3",
      "category": "blocks",
      "description": "Small section heading.",
      "plateKey": "h3",
      "icon": "heading-3",
      "keywords": ["subtitle", "h3", "heading"],
      "files": [],
      "dependencies": []
    },
    "bulleted-list": {
      "name": "Bulleted list",
      "category": "blocks",
      "description": "Create a bulleted list.",
      "plateKey": "ul",
      "icon": "list",
      "keywords": ["unordered", "ul", "-", "bullet"],
      "files": [],
      "dependencies": []
    },
    "numbered-list": {
      "name": "Numbered list",
      "category": "blocks",
      "description": "Create a numbered list.",
      "plateKey": "ol",
      "icon": "list-ordered",
      "keywords": ["ordered", "ol", "1", "number"],
      "files": [],
      "dependencies": []
    },
    "todo-list": {
      "name": "To-do list",
      "category": "blocks",
      "description": "Insert a checklist for tasks.",
      "plateKey": "action_item",
      "icon": "square-check",
      "keywords": ["checklist", "task", "checkbox", "[]", "todo"],
      "files": [],
      "dependencies": []
    },
    "toggle": {
      "name": "Toggle",
      "category": "blocks",
      "description": "Insert a collapsible section.",
      "plateKey": "toggle",
      "icon": "chevron-down",
      "keywords": ["collapsible", "expandable", "accordion"],
      "files": [],
      "dependencies": []
    },
    "code-block": {
      "name": "Code Block",
      "category": "blocks",
      "description": "Insert a block for code.",
      "plateKey": "code_block",
      "icon": "code",
      "keywords": ["```", "code", "syntax"],
      "files": [],
      "dependencies": []
    },
    "table": {
      "name": "Table",
      "category": "blocks",
      "description": "Create a table for data.",
      "plateKey": "table",
      "icon": "table",
      "keywords": ["table", "grid", "data"],
      "files": [],
      "dependencies": []
    },
    "blockquote": {
      "name": "Blockquote",
      "category": "blocks",
      "description": "Insert a quote for emphasis.",
      "plateKey": "blockquote",
      "icon": "quote",
      "keywords": ["citation", "blockquote", "quote", ">"],
      "files": [],
      "dependencies": []
    },
    "callout": {
      "name": "Callout",
      "category": "blocks",
      "description": "Insert a highlighted block.",
      "plateKey": "callout",
      "icon": "lightbulb",
      "keywords": ["note", "info", "warning", "callout"],
      "files": [],
      "dependencies": []
    },
    "divider": {
      "name": "Divider",
      "category": "blocks",
      "description": "Insert a horizontal line to separate content.",
      "plateKey": "hr",
      "icon": "minus",
      "keywords": ["divider", "separator", "line", "hr"],
      "files": [],
      "dependencies": []
    },
    "image": {
      "name": "Image",
      "category": "media",
      "description": "Insert an image.",
      "plateKey": "img",
      "icon": "image",
      "keywords": ["image", "picture", "photo"],
      "files": [],
      "dependencies": []
    },
    "video": {
      "name": "Video",
      "category": "media",
      "description": "Embed a video.",
      "plateKey": "video",
      "icon": "film",
      "keywords": ["video", "movie", "embed"],
      "files": [],
      "dependencies": []
    },
    "audio": {
      "name": "Audio",
      "category": "media",
      "description": "Embed audio content.",
      "plateKey": "audio",
      "icon": "audio-lines",
      "keywords": ["audio", "sound", "music"],
      "files": [],
      "dependencies": []
    },
    "file": {
      "name": "File",
      "category": "media",
      "description": "Upload and link to a file.",
      "plateKey": "file",
      "icon": "file-up",
      "keywords": ["file", "attachment", "upload"],
      "files": [],
      "dependencies": []
    },
    "equation": {
      "name": "Equation",
      "category": "blocks",
      "description": "Insert a LaTeX equation block.",
      "plateKey": "equation",
      "icon": "radical",
      "keywords": ["math", "latex", "formula", "equation"],
      "files": [],
      "dependencies": []
    },
    "toc": {
      "name": "Table of Contents",
      "category": "blocks",
      "description": "Insert an auto-generated table of contents.",
      "plateKey": "toc",
      "icon": "table-of-contents",
      "keywords": ["toc", "contents", "navigation"],
      "files": [],
      "dependencies": []
    },
    "columns": {
      "name": "3 Columns",
      "category": "layout",
      "description": "Create a 3-column layout.",
      "plateKey": "action_three_columns",
      "icon": "columns",
      "keywords": ["columns", "layout", "grid"],
      "files": [],
      "dependencies": []
    },
    "inline-equation": {
      "name": "Inline Equation",
      "category": "inline",
      "description": "Insert an inline math equation.",
      "plateKey": "inline_equation",
      "icon": "radical",
      "keywords": ["math", "inline", "formula"],
      "files": [],
      "dependencies": []
    },
    "date": {
      "name": "Date",
      "category": "inline",
      "description": "Insert current or custom date.",
      "plateKey": "date",
      "icon": "calendar",
      "keywords": ["date", "time", "calendar"],
      "files": [],
      "dependencies": []
    },
    "accordion": {
      "name": "Accordion",
      "category": "ui-layout",
      "description": "A vertically stacked set of expandable sections.",
      "icon": "chevrons-down-up",
      "keywords": ["accordion", "collapse", "expand", "sections"],
      "files": ["registry/components/ui/accordion.tsx"],
      "dependencies": ["@radix-ui/react-accordion"]
    },
    "alert": {
      "name": "Alert",
      "category": "ui-feedback",
      "description": "Displays a callout for important messages.",
      "icon": "alert-circle",
      "keywords": ["alert", "message", "notification", "callout"],
      "files": ["registry/components/ui/alert.tsx"],
      "dependencies": []
    },
    "alert-dialog": {
      "name": "Alert Dialog",
      "category": "ui-overlay",
      "description": "A modal dialog for important confirmations.",
      "icon": "alert-triangle",
      "keywords": ["dialog", "modal", "confirm", "alert"],
      "files": ["registry/components/ui/alert-dialog.tsx"],
      "dependencies": ["@radix-ui/react-alert-dialog"]
    },
    "aspect-ratio": {
      "name": "Aspect Ratio",
      "category": "ui-layout",
      "description": "Maintains consistent width-to-height ratio.",
      "icon": "ratio",
      "keywords": ["aspect", "ratio", "responsive"],
      "files": ["registry/components/ui/aspect-ratio.tsx"],
      "dependencies": ["@radix-ui/react-aspect-ratio"]
    },
    "avatar": {
      "name": "Avatar",
      "category": "ui-display",
      "description": "An image element with fallback for user profiles.",
      "icon": "user-circle",
      "keywords": ["avatar", "profile", "user", "image"],
      "files": ["registry/components/ui/avatar.tsx"],
      "dependencies": ["@radix-ui/react-avatar"]
    },
    "badge": {
      "name": "Badge",
      "category": "ui-display",
      "description": "A small badge/chip for labels and status indicators.",
      "icon": "tag",
      "keywords": ["badge", "tag", "label", "chip"],
      "files": ["registry/components/ui/badge.tsx"],
      "dependencies": ["class-variance-authority"]
    },
    "breadcrumb": {
      "name": "Breadcrumb",
      "category": "ui-navigation",
      "description": "Shows the user's location in a hierarchy.",
      "icon": "chevron-right",
      "keywords": ["breadcrumb", "navigation", "path"],
      "files": ["registry/components/ui/breadcrumb.tsx"],
      "dependencies": ["@radix-ui/react-slot"]
    },
    "button": {
      "name": "Button",
      "category": "ui-input",
      "description": "A button component with multiple variants and sizes.",
      "icon": "mouse-pointer-click",
      "keywords": ["button", "click", "action"],
      "files": ["registry/components/ui/button.tsx"],
      "dependencies": ["class-variance-authority", "@radix-ui/react-slot"]
    },
    "button-group": {
      "name": "Button Group",
      "category": "ui-input",
      "description": "Groups related buttons together.",
      "icon": "layout-grid",
      "keywords": ["button", "group", "toolbar"],
      "files": ["registry/components/ui/button-group.tsx"],
      "dependencies": ["@radix-ui/react-toggle-group"]
    },
    "calendar": {
      "name": "Calendar",
      "category": "ui-input",
      "description": "A date picker calendar component.",
      "icon": "calendar",
      "keywords": ["calendar", "date", "picker"],
      "files": ["registry/components/ui/calendar.tsx"],
      "dependencies": ["react-day-picker", "date-fns"]
    },
    "card": {
      "name": "Card",
      "category": "ui-layout",
      "description": "A card container with header, content, and footer.",
      "icon": "square",
      "keywords": ["card", "container", "panel"],
      "files": ["registry/components/ui/card.tsx"],
      "dependencies": []
    },
    "carousel": {
      "name": "Carousel",
      "category": "ui-display",
      "description": "A slideshow component for cycling through elements.",
      "icon": "gallery-horizontal",
      "keywords": ["carousel", "slider", "slideshow"],
      "files": ["registry/components/ui/carousel.tsx"],
      "dependencies": ["embla-carousel-react"]
    },
    "chart": {
      "name": "Chart",
      "category": "charts",
      "description": "Chart infrastructure for building data visualizations.",
      "icon": "bar-chart-3",
      "keywords": ["chart", "graph", "visualization"],
      "files": ["registry/components/ui/chart.tsx"],
      "dependencies": ["recharts"]
    },
    "checkbox": {
      "name": "Checkbox",
      "category": "ui-input",
      "description": "A control that allows toggling between checked states.",
      "icon": "check-square",
      "keywords": ["checkbox", "check", "toggle"],
      "files": ["registry/components/ui/checkbox.tsx"],
      "dependencies": ["@radix-ui/react-checkbox"]
    },
    "collapsible": {
      "name": "Collapsible",
      "category": "ui-layout",
      "description": "An interactive component that expands/collapses content.",
      "icon": "fold-vertical",
      "keywords": ["collapsible", "expand", "collapse"],
      "files": ["registry/components/ui/collapsible.tsx"],
      "dependencies": ["@radix-ui/react-collapsible"]
    },
    "command": {
      "name": "Command",
      "category": "ui-input",
      "description": "A command palette for searching and navigation.",
      "icon": "command",
      "keywords": ["command", "search", "palette", "cmdk"],
      "files": ["registry/components/ui/command.tsx"],
      "dependencies": ["cmdk"]
    },
    "context-menu": {
      "name": "Context Menu",
      "category": "ui-overlay",
      "description": "A menu displayed on right-click.",
      "icon": "menu",
      "keywords": ["context", "menu", "right-click"],
      "files": ["registry/components/ui/context-menu.tsx"],
      "dependencies": ["@radix-ui/react-context-menu"]
    },
    "dialog": {
      "name": "Dialog",
      "category": "ui-overlay",
      "description": "A modal dialog window.",
      "icon": "panel-top",
      "keywords": ["dialog", "modal", "popup"],
      "files": ["registry/components/ui/dialog.tsx"],
      "dependencies": ["@radix-ui/react-dialog"]
    },
    "drawer": {
      "name": "Drawer",
      "category": "ui-overlay",
      "description": "A panel that slides out from the edge.",
      "icon": "panel-left",
      "keywords": ["drawer", "panel", "slide"],
      "files": ["registry/components/ui/drawer.tsx"],
      "dependencies": ["vaul"]
    },
    "dropdown-menu": {
      "name": "Dropdown Menu",
      "category": "ui-overlay",
      "description": "A menu that appears from a trigger element.",
      "icon": "chevron-down",
      "keywords": ["dropdown", "menu", "popover"],
      "files": ["registry/components/ui/dropdown-menu.tsx"],
      "dependencies": ["@radix-ui/react-dropdown-menu"]
    },
    "empty": {
      "name": "Empty",
      "category": "ui-feedback",
      "description": "A placeholder for empty states.",
      "icon": "inbox",
      "keywords": ["empty", "placeholder", "no-data"],
      "files": ["registry/components/ui/empty.tsx"],
      "dependencies": []
    },
    "field": {
      "name": "Field",
      "category": "ui-input",
      "description": "A form field wrapper with label and error handling.",
      "icon": "text-cursor-input",
      "keywords": ["field", "form", "input", "label"],
      "files": ["registry/components/ui/field.tsx"],
      "dependencies": []
    },
    "form": {
      "name": "Form",
      "category": "ui-input",
      "description": "Form components with react-hook-form integration.",
      "icon": "file-input",
      "keywords": ["form", "validation", "react-hook-form"],
      "files": ["registry/components/ui/form.tsx"],
      "dependencies": ["react-hook-form", "@hookform/resolvers", "zod"]
    },
    "hover-card": {
      "name": "Hover Card",
      "category": "ui-overlay",
      "description": "A card that appears on hover.",
      "icon": "mouse-pointer-2",
      "keywords": ["hover", "card", "preview"],
      "files": ["registry/components/ui/hover-card.tsx"],
      "dependencies": ["@radix-ui/react-hover-card"]
    },
    "input": {
      "name": "Input",
      "category": "ui-input",
      "description": "A text input field.",
      "icon": "text-cursor",
      "keywords": ["input", "text", "field"],
      "files": ["registry/components/ui/input.tsx"],
      "dependencies": []
    },
    "input-group": {
      "name": "Input Group",
      "category": "ui-input",
      "description": "Groups inputs with addons and text.",
      "icon": "layout-list",
      "keywords": ["input", "group", "addon"],
      "files": ["registry/components/ui/input-group.tsx"],
      "dependencies": []
    },
    "input-otp": {
      "name": "Input OTP",
      "category": "ui-input",
      "description": "One-time password input component.",
      "icon": "key-round",
      "keywords": ["otp", "pin", "code", "verification"],
      "files": ["registry/components/ui/input-otp.tsx"],
      "dependencies": ["input-otp"]
    },
    "item": {
      "name": "Item",
      "category": "ui-display",
      "description": "A list item component with media and actions.",
      "icon": "list",
      "keywords": ["item", "list", "row"],
      "files": ["registry/components/ui/item.tsx"],
      "dependencies": ["@radix-ui/react-slot"]
    },
    "kbd": {
      "name": "Kbd",
      "category": "ui-display",
      "description": "Displays keyboard shortcuts.",
      "icon": "keyboard",
      "keywords": ["keyboard", "shortcut", "key"],
      "files": ["registry/components/ui/kbd.tsx"],
      "dependencies": []
    },
    "label": {
      "name": "Label",
      "category": "ui-input",
      "description": "A label for form controls.",
      "icon": "tag",
      "keywords": ["label", "form", "accessibility"],
      "files": ["registry/components/ui/label.tsx"],
      "dependencies": ["@radix-ui/react-label"]
    },
    "menubar": {
      "name": "Menubar",
      "category": "ui-navigation",
      "description": "A horizontal menu bar with dropdowns.",
      "icon": "menu-square",
      "keywords": ["menubar", "menu", "navigation"],
      "files": ["registry/components/ui/menubar.tsx"],
      "dependencies": ["@radix-ui/react-menubar"]
    },
    "navigation-menu": {
      "name": "Navigation Menu",
      "category": "ui-navigation",
      "description": "A navigation menu with links and sub-menus.",
      "icon": "navigation",
      "keywords": ["navigation", "menu", "nav"],
      "files": ["registry/components/ui/navigation-menu.tsx"],
      "dependencies": ["@radix-ui/react-navigation-menu"]
    },
    "pagination": {
      "name": "Pagination",
      "category": "ui-navigation",
      "description": "Navigation for paginated content.",
      "icon": "more-horizontal",
      "keywords": ["pagination", "pages", "navigation"],
      "files": ["registry/components/ui/pagination.tsx"],
      "dependencies": []
    },
    "popover": {
      "name": "Popover",
      "category": "ui-overlay",
      "description": "A floating content panel triggered by a button.",
      "icon": "message-square",
      "keywords": ["popover", "popup", "tooltip"],
      "files": ["registry/components/ui/popover.tsx"],
      "dependencies": ["@radix-ui/react-popover"]
    },
    "progress": {
      "name": "Progress",
      "category": "ui-feedback",
      "description": "Shows progress toward a goal.",
      "icon": "loader",
      "keywords": ["progress", "loading", "bar"],
      "files": ["registry/components/ui/progress.tsx"],
      "dependencies": ["@radix-ui/react-progress"]
    },
    "radio-group": {
      "name": "Radio Group",
      "category": "ui-input",
      "description": "A set of radio buttons for single selection.",
      "icon": "circle-dot",
      "keywords": ["radio", "select", "options"],
      "files": ["registry/components/ui/radio-group.tsx"],
      "dependencies": ["@radix-ui/react-radio-group"]
    },
    "resizable": {
      "name": "Resizable",
      "category": "ui-layout",
      "description": "Resizable panel groups and handles.",
      "icon": "move",
      "keywords": ["resizable", "resize", "panels"],
      "files": ["registry/components/ui/resizable.tsx"],
      "dependencies": ["react-resizable-panels"]
    },
    "scroll-area": {
      "name": "Scroll Area",
      "category": "ui-layout",
      "description": "A custom scrollbar container.",
      "icon": "scroll",
      "keywords": ["scroll", "overflow", "scrollbar"],
      "files": ["registry/components/ui/scroll-area.tsx"],
      "dependencies": ["@radix-ui/react-scroll-area"]
    },
    "select": {
      "name": "Select",
      "category": "ui-input",
      "description": "A dropdown select component.",
      "icon": "chevron-down",
      "keywords": ["select", "dropdown", "picker"],
      "files": ["registry/components/ui/select.tsx"],
      "dependencies": ["@radix-ui/react-select"]
    },
    "separator": {
      "name": "Separator",
      "category": "ui-layout",
      "description": "Visually separates content.",
      "icon": "minus",
      "keywords": ["separator", "divider", "line"],
      "files": ["registry/components/ui/separator.tsx"],
      "dependencies": ["@radix-ui/react-separator"]
    },
    "sheet": {
      "name": "Sheet",
      "category": "ui-overlay",
      "description": "A dialog that slides in from the edge.",
      "icon": "panel-right",
      "keywords": ["sheet", "panel", "drawer"],
      "files": ["registry/components/ui/sheet.tsx"],
      "dependencies": ["@radix-ui/react-dialog"]
    },
    "sidebar": {
      "name": "Sidebar",
      "category": "ui-navigation",
      "description": "A responsive sidebar navigation component.",
      "icon": "sidebar",
      "keywords": ["sidebar", "navigation", "menu"],
      "files": ["registry/components/ui/sidebar.tsx"],
      "dependencies": ["@radix-ui/react-slot"]
    },
    "skeleton": {
      "name": "Skeleton",
      "category": "ui-feedback",
      "description": "A loading placeholder animation.",
      "icon": "box",
      "keywords": ["skeleton", "loading", "placeholder"],
      "files": ["registry/components/ui/skeleton.tsx"],
      "dependencies": []
    },
    "slider": {
      "name": "Slider",
      "category": "ui-input",
      "description": "A slider for selecting numeric values.",
      "icon": "sliders-horizontal",
      "keywords": ["slider", "range", "input"],
      "files": ["registry/components/ui/slider.tsx"],
      "dependencies": ["@radix-ui/react-slider"]
    },
    "sonner": {
      "name": "Toaster",
      "category": "ui-feedback",
      "description": "Toast notifications using Sonner.",
      "icon": "bell",
      "keywords": ["toast", "notification", "sonner"],
      "files": ["registry/components/ui/sonner.tsx"],
      "dependencies": ["sonner", "next-themes"]
    },
    "spinner": {
      "name": "Spinner",
      "category": "ui-feedback",
      "description": "A loading spinner indicator.",
      "icon": "loader-2",
      "keywords": ["spinner", "loading", "loader"],
      "files": ["registry/components/ui/spinner.tsx"],
      "dependencies": []
    },
    "switch": {
      "name": "Switch",
      "category": "ui-input",
      "description": "A toggle switch component.",
      "icon": "toggle-right",
      "keywords": ["switch", "toggle", "boolean"],
      "files": ["registry/components/ui/switch.tsx"],
      "dependencies": ["@radix-ui/react-switch"]
    },
    "ui-table": {
      "name": "Table",
      "category": "ui-display",
      "description": "A styled HTML table component.",
      "icon": "table",
      "keywords": ["table", "data", "grid"],
      "files": ["registry/components/ui/table.tsx"],
      "dependencies": []
    },
    "tabs": {
      "name": "Tabs",
      "category": "ui-navigation",
      "description": "Tabbed interface for switching content.",
      "icon": "layout-panel-top",
      "keywords": ["tabs", "navigation", "panels"],
      "files": ["registry/components/ui/tabs.tsx"],
      "dependencies": ["@radix-ui/react-tabs"]
    },
    "textarea": {
      "name": "Textarea",
      "category": "ui-input",
      "description": "A multi-line text input.",
      "icon": "text",
      "keywords": ["textarea", "text", "multiline"],
      "files": ["registry/components/ui/textarea.tsx"],
      "dependencies": []
    },
    "toggle-ui": {
      "name": "Toggle",
      "category": "ui-input",
      "description": "A two-state button that can be on or off.",
      "icon": "toggle-left",
      "keywords": ["toggle", "button", "switch"],
      "files": ["registry/components/ui/toggle.tsx"],
      "dependencies": ["@radix-ui/react-toggle"]
    },
    "toggle-group": {
      "name": "Toggle Group",
      "category": "ui-input",
      "description": "A group of toggle buttons.",
      "icon": "layout-grid",
      "keywords": ["toggle", "group", "buttons"],
      "files": ["registry/components/ui/toggle-group.tsx"],
      "dependencies": ["@radix-ui/react-toggle-group"]
    },
    "tooltip": {
      "name": "Tooltip",
      "category": "ui-overlay",
      "description": "Shows information on hover.",
      "icon": "message-circle",
      "keywords": ["tooltip", "hint", "help"],
      "files": ["registry/components/ui/tooltip.tsx"],
      "dependencies": ["@radix-ui/react-tooltip"]
    },
    "metric-card": {
      "name": "MetricCard",
      "category": "data",
      "description": "Display a single metric with label, value, and optional trend.",
      "icon": "trending-up",
      "keywords": ["metric", "kpi", "stat"],
      "files": ["registry/components/data/metric-card.tsx"],
      "dependencies": []
    },
    "data-table": {
      "name": "DataTable",
      "category": "data",
      "description": "A data table for displaying rows of data with columns.",
      "icon": "table-2",
      "keywords": ["data", "table", "grid"],
      "files": ["registry/components/data/data-table.tsx"],
      "dependencies": []
    },
    "line-chart": {
      "name": "LineChart",
      "category": "charts",
      "description": "A line chart for time series data.",
      "icon": "line-chart",
      "keywords": ["line", "chart", "graph", "trend"],
      "files": ["registry/components/charts/line-chart.tsx"],
      "dependencies": ["recharts"]
    },
    "bar-chart": {
      "name": "BarChart",
      "category": "charts",
      "description": "A bar chart for categorical comparisons.",
      "icon": "bar-chart-2",
      "keywords": ["bar", "chart", "graph"],
      "files": ["registry/components/charts/bar-chart.tsx"],
      "dependencies": ["recharts"]
    }
  },
  "categories": {
    "blocks": { "name": "Basic Blocks", "description": "Basic content blocks for documents" },
    "media": { "name": "Media", "description": "Images, video, audio, files" },
    "inline": { "name": "Inline", "description": "Inline elements within text" },
    "layout": { "name": "Layout", "description": "Page layout components" },
    "ui-input": { "name": "Form Inputs", "description": "Form controls and input components" },
    "ui-display": { "name": "Data Display", "description": "Components for displaying data" },
    "ui-feedback": { "name": "Feedback", "description": "Loading, progress, and notifications" },
    "ui-overlay": { "name": "Overlays", "description": "Dialogs, popovers, and modals" },
    "ui-navigation": { "name": "Navigation", "description": "Navigation and menu components" },
    "ui-layout": { "name": "UI Layout", "description": "Layout primitives and containers" },
    "data": { "name": "Data", "description": "Components for data visualization" },
    "charts": { "name": "Charts", "description": "Chart and graph components" }
  }
} as const;
export default registry;
