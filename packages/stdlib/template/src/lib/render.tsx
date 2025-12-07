import * as React from "react";
import { renderToString } from "react-dom/server";

// CSS is inlined since we can't easily bundle in Workers
// This contains the essential Tailwind classes for charts
const inlineStyles = `
:root {
  --background: 0 0% 100%;
  --foreground: 0 0% 3.9%;
  --card: 0 0% 100%;
  --card-foreground: 0 0% 3.9%;
  --popover: 0 0% 100%;
  --popover-foreground: 0 0% 3.9%;
  --primary: 0 0% 9%;
  --primary-foreground: 0 0% 98%;
  --secondary: 0 0% 96.1%;
  --secondary-foreground: 0 0% 9%;
  --muted: 0 0% 96.1%;
  --muted-foreground: 0 0% 45.1%;
  --accent: 0 0% 96.1%;
  --accent-foreground: 0 0% 9%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 0 0% 98%;
  --border: 0 0% 89.8%;
  --input: 0 0% 89.8%;
  --ring: 0 0% 3.9%;
  --radius: 0.5rem;
  --chart-1: 12 76% 61%;
  --chart-2: 173 58% 39%;
  --chart-3: 197 37% 24%;
  --chart-4: 43 74% 66%;
  --chart-5: 27 87% 67%;
}

.dark {
  --background: 0 0% 3.9%;
  --foreground: 0 0% 98%;
  --card: 0 0% 3.9%;
  --card-foreground: 0 0% 98%;
  --popover: 0 0% 3.9%;
  --popover-foreground: 0 0% 98%;
  --primary: 0 0% 98%;
  --primary-foreground: 0 0% 9%;
  --secondary: 0 0% 14.9%;
  --secondary-foreground: 0 0% 98%;
  --muted: 0 0% 14.9%;
  --muted-foreground: 0 0% 63.9%;
  --accent: 0 0% 14.9%;
  --accent-foreground: 0 0% 98%;
  --destructive: 0 62.8% 30.6%;
  --destructive-foreground: 0 0% 98%;
  --border: 0 0% 14.9%;
  --input: 0 0% 14.9%;
  --ring: 0 0% 83.1%;
  --chart-1: 220 70% 50%;
  --chart-2: 160 60% 45%;
  --chart-3: 30 80% 55%;
  --chart-4: 280 65% 60%;
  --chart-5: 340 75% 55%;
}

*, ::before, ::after { box-sizing: border-box; border-width: 0; border-style: solid; border-color: hsl(var(--border)); }
html { line-height: 1.5; -webkit-text-size-adjust: 100%; font-family: system-ui, -apple-system, sans-serif; }
body { margin: 0; line-height: inherit; background-color: hsl(var(--background)); color: hsl(var(--foreground)); }

.min-h-screen { min-height: 100vh; }
.bg-background { background-color: hsl(var(--background)); }
.p-6 { padding: 1.5rem; }
.mx-auto { margin-left: auto; margin-right: auto; }
.max-w-7xl { max-width: 80rem; }
.grid { display: grid; }
.gap-6 { gap: 1.5rem; }
.rounded-lg { border-radius: var(--radius); }
.border { border-width: 1px; }
.bg-card { background-color: hsl(var(--card)); }
.text-card-foreground { color: hsl(var(--card-foreground)); }
.shadow-sm { box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); }
.flex { display: flex; }
.flex-col { flex-direction: column; }
.space-y-1\\.5 > :not([hidden]) ~ :not([hidden]) { margin-top: 0.375rem; }
.text-2xl { font-size: 1.5rem; line-height: 2rem; }
.font-semibold { font-weight: 600; }
.leading-none { line-height: 1; }
.tracking-tight { letter-spacing: -0.025em; }
.text-sm { font-size: 0.875rem; line-height: 1.25rem; }
.text-muted-foreground { color: hsl(var(--muted-foreground)); }
.pt-0 { padding-top: 0; }
.text-center { text-align: center; }
.items-center { align-items: center; }
.justify-center { justify-content: center; }
.mt-2 { margin-top: 0.5rem; }
.font-bold { font-weight: 700; }
.overflow-x-auto { overflow-x: auto; }
.w-full { width: 100%; }
.border-b { border-bottom-width: 1px; }
.px-4 { padding-left: 1rem; padding-right: 1rem; }
.py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
.text-left { text-align: left; }
.font-medium { font-weight: 500; }
.text-xs { font-size: 0.75rem; line-height: 1rem; }

@media (min-width: 768px) {
  .md\\:grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

code { font-family: ui-monospace, monospace; background: hsl(var(--muted)); padding: 0.125rem 0.25rem; border-radius: 0.25rem; font-size: 0.875em; }
`;

interface RenderOptions {
  title?: string;
  initialData?: Record<string, unknown>;
}

export function renderPage(
  component: React.ReactElement,
  options: RenderOptions = {}
): string {
  const html = renderToString(component);
  const { title = "Dashboard", initialData } = options;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>${inlineStyles}</style>
</head>
<body>
  <div id="root">${html}</div>
  ${initialData ? `<script>window.__INITIAL_DATA__ = ${JSON.stringify(initialData)};</script>` : ""}
</body>
</html>`;
}
