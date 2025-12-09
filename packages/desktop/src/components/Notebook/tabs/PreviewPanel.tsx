import { WorkbookEditor } from "../editor/WorkbookEditor";

export function PreviewPanel() {
  return (
    <div className="h-full flex flex-col">
      <WorkbookEditor />
    </div>
  );
}
