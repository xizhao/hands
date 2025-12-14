/**
 * EditorSandbox - Block editor in an iframe
 *
 * Thin wrapper around SandboxFrame for block editing.
 * Requires block server to be ready since blocks need RSC rendering.
 */

import { SandboxFrame } from "./SandboxFrame";

interface EditorSandboxProps {
  blockId: string;
  className?: string;
  readOnly?: boolean;
}

export function EditorSandbox({ blockId, className, readOnly = false }: EditorSandboxProps) {
  return (
    <SandboxFrame
      blockId={blockId}
      className={className}
      readOnly={readOnly}
      requireBlockServer={true}
    />
  );
}
