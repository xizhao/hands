/**
 * @hands/core/stdlib/active
 *
 * Active components - handle user interaction and execute SQL mutations.
 */

// Form controls
export {
  ActionButton,
  type ActionButtonProps,
  BUTTON_KEY,
  ButtonPlugin,
  createButtonElement,
} from "./button";
export {
  ActionCheckbox,
  type ActionCheckboxProps,
  CHECKBOX_KEY,
  CheckboxPlugin,
  createCheckboxElement,
} from "./checkbox";

export {
  ActionInput,
  type ActionInputProps,
  createInputElement,
  INPUT_KEY,
  InputPlugin,
} from "./input";
// LiveAction container
export {
  createLiveActionElement,
  LIVE_ACTION_KEY,
  LiveAction,
  LiveActionContext,
  LiveActionPlugin,
  type LiveActionProps,
  substituteFormBindings,
  useLiveAction,
  useLiveActionOptional,
} from "./live-action";
export {
  ActionSelect,
  type ActionSelectProps,
  createSelectElement,
  SELECT_KEY,
  type SelectOption,
  SelectPlugin,
} from "./select";

export {
  ActionTextarea,
  type ActionTextareaProps,
  createTextareaElement,
  TEXTAREA_KEY,
  TextareaPlugin,
} from "./textarea";

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

import { ButtonPlugin } from "./button";
import { CheckboxPlugin } from "./checkbox";
import { InputPlugin } from "./input";
import { KanbanPlugin } from "./kanban";
// Plugin kit for easy registration
import { LiveActionPlugin } from "./live-action";
import { SelectPlugin } from "./select";
import { TextareaPlugin } from "./textarea";

export const ActiveKit = [
  LiveActionPlugin,
  ButtonPlugin,
  InputPlugin,
  SelectPlugin,
  CheckboxPlugin,
  TextareaPlugin,
  KanbanPlugin,
] as const;
