import { EditorSandbox } from "../editor/EditorSandbox";

export function PreviewPanel() {
  return (
    <div className="h-full flex flex-col">
      <EditorSandbox blockId="" />
    </div>
  );
}
