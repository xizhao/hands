/**
 * PageEditorSandbox - MDX page editor in an iframe
 *
 * Thin wrapper around SandboxFrame for page editing.
 * Does NOT require block server - pages render immediately,
 * RSC blocks inside handle their own loading states.
 */

import { SandboxFrame } from "./SandboxFrame";

interface PageEditorSandboxProps {
  pageId: string;
  className?: string;
  readOnly?: boolean;
}

export function PageEditorSandbox({ pageId, className, readOnly = false }: PageEditorSandboxProps) {
  return (
    <SandboxFrame
      pageId={pageId}
      className={className}
      readOnly={readOnly}
      requireBlockServer={false}
    />
  );
}
