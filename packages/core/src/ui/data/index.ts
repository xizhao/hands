/**
 * @hands/core/stdlib/data
 *
 * Data components - self-contained data management with CRUD operations.
 * These components display data AND handle insert/update/delete mutations.
 */

// DataGrid
export {
  createDataGridElement,
  type CreateDataGridOptions,
  DATA_GRID_KEY,
  DataGrid,
  DataGridPlugin,
  type DataGridProps,
} from "./data-grid";

// Kanban board
export {
  Kanban,
  KanbanBoard,
  KanbanPlugin,
  createKanbanElement,
  findMovedItem,
  getColumnOrder,
  groupByColumn,
  KANBAN_KEY,
  type CreateKanbanElementOptions,
  type KanbanBoardProps,
  type KanbanBoardValue,
  type KanbanItem,
  type KanbanProps,
  type MovedItem,
} from "./kanban";

import { DataGridPlugin } from "./data-grid";
import { KanbanPlugin } from "./kanban";

export const DataKit = [DataGridPlugin, KanbanPlugin] as const;
