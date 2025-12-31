/**
 * ActionCodeView - Code view for actions using shared MonacoEditor
 *
 * Reuses the same editor and theming as the markdown code mode.
 */

import { MonacoEditor } from "../code-editor/MonacoEditor";

interface ActionCodeViewProps {
  source: string;
}

export function ActionCodeView({ source }: ActionCodeViewProps) {
  return (
    <div className="h-full">
      <MonacoEditor value={source} language="typescript" readOnly />
    </div>
  );
}
