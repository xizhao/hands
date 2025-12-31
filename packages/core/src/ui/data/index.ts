/**
 * @hands/core/stdlib/data
 *
 * Data components - self-contained data management with CRUD operations.
 * These components display data AND handle insert/update/delete mutations.
 */

// DataGrid
export {
  type CreateDataGridOptions,
  createDataGridElement,
  DATA_GRID_KEY,
  DataGrid,
  DataGridPlugin,
  type DataGridProps,
} from "./data-grid";

// Kanban board
export {
  type CreateKanbanElementOptions,
  createKanbanElement,
  findMovedItem,
  getColumnOrder,
  groupByColumn,
  KANBAN_KEY,
  Kanban,
  KanbanBoard,
  type KanbanBoardProps,
  type KanbanBoardValue,
  type KanbanItem,
  KanbanPlugin,
  type KanbanProps,
  type MovedItem,
} from "./kanban";

import { DataGridPlugin } from "./data-grid";
import { KanbanPlugin } from "./kanban";

export const DataKit = [DataGridPlugin, KanbanPlugin] as const;
