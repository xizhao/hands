import type { TElement, Value } from "platejs";
import { createSlateEditor, createSlatePlugin } from "platejs";
import { PlateStatic } from "platejs/static";
import { Suspense } from "react";

/** RSC block element in Plate value */
interface RscBlockElement extends TElement {
  type: "rsc-block";
  blockId: string;
  blockProps?: Record<string, unknown>;
}

interface PageStaticProps {
  value: Value;
  /** Block components keyed by ID */
  blocks: Record<string, React.FC<Record<string, unknown>>>;
}

/**
 * Server-side page renderer using PlateStatic
 *
 * Renders Plate value with support for rsc-block elements.
 * Blocks are rendered directly as RSC - rwsdk handles streaming + HMR.
 *
 * TODO: Consolidate rsc-block handling into @hands/core/blocks package
 * Currently scattered across:
 *   - editor/mdx/parser.ts (parse <Block> → rsc-block)
 *   - editor/plate/plugins/markdown-kit.tsx (serialize rsc-block → <Block>)
 *   - runtime/components/PageStatic.tsx (render rsc-block in PlateStatic) ← YOU ARE HERE
 */
export function PageStatic({ value, blocks }: PageStaticProps) {
  const RscBlockPlugin = createSlatePlugin({
    key: "rsc-block",
    node: {
      type: "rsc-block",
      isVoid: true,
      isElement: true,
      component: ({ element }: { element: RscBlockElement }) => {
        if (!element.blockId) return null; // block does not have src, being created
        const BlockComponent = blocks[element.blockId];
        if (!BlockComponent) {
          return (
            <div className="text-red-500">
              Block not found: {element.blockId}
            </div>
          );
        }
        return (
          <Suspense
            fallback={
              <div className="animate-pulse bg-muted h-32 rounded-lg" />
            }
          >
            <BlockComponent {...(element.blockProps || {})} />
          </Suspense>
        );
      },
    },
    extendEditor: ({ editor }) => {
      const origIsVoid = editor.isVoid as (element: TElement) => boolean;
      editor.isVoid = (element: TElement) => {
        if (element.type === "rsc-block") return true;
        return origIsVoid(element);
      };
      return editor;
    },
  });

  const editor = createSlateEditor({
    value,
    plugins: [RscBlockPlugin],
  });

  return <PlateStatic editor={editor} />;
}
