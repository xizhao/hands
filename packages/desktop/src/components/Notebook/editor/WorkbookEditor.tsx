/**
 * WorkbookEditor - Sandbox-based rich editor for MDX pages
 *
 * Wraps EditorSandbox which hosts the editor in an iframe for crash isolation.
 * All editing logic is now handled inside the sandbox.
 */

import { cn } from "@/lib/utils";
import { useParams } from "@tanstack/react-router";
import { EditorSandbox } from "./EditorSandbox";

interface WorkbookEditorProps {
  className?: string;
  readOnly?: boolean;
}

export function WorkbookEditor({
  className,
  readOnly = false,
}: WorkbookEditorProps) {
  // Get pageId from route params
  const { pageId } = useParams({ from: "/_notebook/page/$pageId" });

  return (
    <EditorSandbox
      pageId={pageId}
      className={cn("h-full", className)}
      readOnly={readOnly}
    />
  );
}
