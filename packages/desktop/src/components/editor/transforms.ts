import type { SlateEditor, TElement } from 'platejs';

/**
 * Insert a block at the current selection.
 * Uses Plate's transform API.
 */
export function insertBlock(editor: SlateEditor, type: string) {
  const { selection } = editor;
  if (!selection) return;

  // Use setNodes with a proper type assertion
  editor.tf.setNodes(
    { type } as Partial<TElement>,
    { match: (n: TElement) => editor.api.isBlock(n) }
  );
}
