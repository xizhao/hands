'use client';

import { Plate, usePlateEditor } from 'platejs/react';

import { EditorKit } from '@/components/editor/editor-kit';
// import { [] } from '@/registry/examples/values/playground-value';
import { Editor, EditorContainer } from '@/components/ui/editor';
import { TocSidebar } from '@/components/ui/toc-sidebar';

export function PlateEditor() {
  const editor = usePlateEditor({
    plugins: EditorKit,
    value: [],
  });

  return (
    <Plate editor={editor}>
      <TocSidebar className="top-[130px]" topOffset={30} />

      <EditorContainer>
        <Editor placeholder="Type..." variant="demo" />
      </EditorContainer>
    </Plate>
  );
}
