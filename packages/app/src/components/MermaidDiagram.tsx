/**
 * MermaidDiagram - Renders Mermaid diagram code as SVG
 *
 * Uses mermaid.js to parse and render diagrams.
 */

import mermaid from "mermaid";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// Initialize mermaid with default config
mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  securityLevel: "loose",
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
  flowchart: {
    htmlLabels: true,
    curve: "basis",
  },
  sequence: {
    diagramMarginX: 8,
    diagramMarginY: 8,
  },
});

interface MermaidDiagramProps {
  code: string;
  className?: string;
}

export function MermaidDiagram({ code, className }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uniqueId = useId().replace(/:/g, "-");

  useEffect(() => {
    const renderDiagram = async () => {
      if (!code.trim()) {
        setSvg(null);
        setError(null);
        return;
      }

      try {
        // Validate the diagram syntax first
        const valid = await mermaid.parse(code);
        if (!valid) {
          setError("Invalid mermaid syntax");
          setSvg(null);
          return;
        }

        // Render the diagram
        const { svg: renderedSvg } = await mermaid.render(`mermaid-${uniqueId}`, code);

        setSvg(renderedSvg);
        setError(null);
      } catch (err) {
        console.error("[MermaidDiagram] Render error:", err);
        setError(err instanceof Error ? err.message : "Failed to render diagram");
        setSvg(null);
      }
    };

    renderDiagram();
  }, [code, uniqueId]);

  if (error) {
    return (
      <div
        className={cn(
          "p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm",
          className,
        )}
      >
        <p className="font-medium mb-1">Diagram Error</p>
        <p className="font-mono text-xs">{error}</p>
        <pre className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap">{code}</pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className={cn("p-4 rounded-lg bg-muted/50 animate-pulse", className)}>
        <div className="h-32 bg-muted rounded" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "p-4 rounded-lg bg-muted/30 overflow-x-auto",
        "[&_svg]:max-w-full [&_svg]:h-auto",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/**
 * Extract mermaid code blocks from markdown text
 */
export function extractMermaidBlocks(markdown: string): string[] {
  const mermaidRegex = /```mermaid\n([\s\S]*?)```/g;
  const blocks: string[] = [];
  let match: RegExpExecArray | null = mermaidRegex.exec(markdown);

  while (match !== null) {
    blocks.push(match[1].trim());
    match = mermaidRegex.exec(markdown);
  }

  return blocks;
}
