/**
 * Block Rendering Utilities
 *
 * Renders blocks from notebook.json using stdlib components.
 */
import * as React from "react";
import { renderToString } from "react-dom/server";
import { SqlBlock, ChartBlock, TextBlock, TableBlock } from "@hands/stdlib";
import { createDb, runQuery } from "./db";

export interface BlockConfig {
  id: string;
  type: "sql" | "chart" | "text" | "table";
  props: Record<string, unknown>;
}

interface RenderBlockOptions {
  databaseUrl: string;
}

/**
 * Render a block to HTML
 */
export async function renderBlock(
  block: BlockConfig,
  options: RenderBlockOptions
): Promise<string> {
  const sql = createDb(options.databaseUrl);

  try {
    switch (block.type) {
      case "sql": {
        const query = block.props.query as string;
        let data: Record<string, unknown>[] = [];
        let error: string | undefined;

        if (query) {
          try {
            data = await runQuery(sql, query);
          } catch (e) {
            error = String(e);
          }
        }

        return renderToString(
          <SqlBlock
            query={query}
            data={data}
            error={error}
            title={block.props.title as string}
          />
        );
      }

      case "chart": {
        const query = block.props.query as string;
        let chartData: Array<{ label: string; value: number }> = [];

        if (query) {
          try {
            const result = await runQuery(sql, query);
            // Transform query result to chart data format
            chartData = result.map((row) => ({
              label: String(row[Object.keys(row)[0]] || ""),
              value: Number(row[Object.keys(row)[1]] || 0),
            }));
          } catch (e) {
            console.error("Chart query error:", e);
          }
        } else if (block.props.data) {
          chartData = block.props.data as Array<{ label: string; value: number }>;
        }

        return renderToString(
          <ChartBlock
            type={(block.props.chartType as "line" | "bar" | "pie" | "area") || "bar"}
            data={chartData}
            title={block.props.title as string}
            color={block.props.color as string}
          />
        );
      }

      case "text": {
        return renderToString(
          <TextBlock
            content={block.props.content as string}
            format={block.props.format as "markdown" | "html" | "plain"}
          />
        );
      }

      case "table": {
        const query = block.props.query as string;
        let data: Record<string, unknown>[] = [];

        if (query) {
          try {
            data = await runQuery(sql, query);
          } catch (e) {
            console.error("Table query error:", e);
          }
        } else if (block.props.data) {
          data = block.props.data as Record<string, unknown>[];
        }

        // Auto-generate columns from data if not provided
        const columns = (block.props.columns as Array<{ key: string; label?: string }>) ||
          (data.length > 0
            ? Object.keys(data[0]).map((key) => ({ key, label: key }))
            : []);

        return renderToString(
          <TableBlock
            columns={columns}
            data={data}
            title={block.props.title as string}
            pageSize={block.props.pageSize as number}
          />
        );
      }

      default:
        return `<div class="p-4 text-muted-foreground">Unknown block type: ${block.type}</div>`;
    }
  } catch (error) {
    return `<div class="p-4 border border-red-200 bg-red-50 text-red-700 rounded-lg">
      <strong>Block Error:</strong> ${String(error)}
    </div>`;
  }
}

/**
 * Wrap block HTML in a container with styles
 */
export function wrapBlockHtml(html: string, blockId: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      margin: 0;
      padding: 0;
    }
    .prose { max-width: none; }
  </style>
</head>
<body class="bg-transparent" data-block-id="${blockId}">
  ${html}
</body>
</html>`;
}
