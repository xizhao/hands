/**
 * DataGrid Serialization Rule
 *
 * Handles MDX ↔ Plate conversion for DataGrid elements.
 */

import { DATA_GRID_KEY, type TDataGridElement } from "../../../types";
import type { MdxSerializationRule } from "../types";
import { parseAttributes, serializeAttributes, createVoidElement } from "../helpers";

// ============================================================================
// DataGrid
// ============================================================================

/**
 * DataGrid serialization rule.
 *
 * MDX Example:
 * ```mdx
 * <DataGrid />
 * <DataGrid height={400} readOnly />
 * <DataGrid columns={[{ key: "name", label: "Name" }, { key: "email", label: "Email" }]} />
 * <DataGrid columns="auto" enableSearch enablePaste />
 * ```
 */
export const dataGridRule: MdxSerializationRule<TDataGridElement> = {
  tagName: "DataGrid",
  key: DATA_GRID_KEY,

  deserialize: (node) => {
    const props = parseAttributes(node);

    return createVoidElement<TDataGridElement>(DATA_GRID_KEY, {
      columns: props.columns as TDataGridElement["columns"],
      height: props.height as number | undefined,
      readOnly: props.readOnly as boolean | undefined,
      enableSearch: props.enableSearch as boolean | undefined,
      enablePaste: props.enablePaste as boolean | undefined,
    });
  },

  serialize: (element) => {
    const attrs = serializeAttributes(
      {
        columns: element.columns,
        height: element.height,
        readOnly: element.readOnly,
        enableSearch: element.enableSearch,
        enablePaste: element.enablePaste,
      },
      {
        include: ["columns", "height", "readOnly", "enableSearch", "enablePaste"],
        defaults: {
          columns: "auto",
          readOnly: false,
          enableSearch: false,
          enablePaste: false,
        },
      }
    );

    return {
      type: "mdxJsxFlowElement",
      name: "DataGrid",
      attributes: attrs,
      children: [],
    };
  },
};

// ============================================================================
// Export all rules
// ============================================================================

export const dataGridRules = [dataGridRule];
