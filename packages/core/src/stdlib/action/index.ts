/**
 * @hands/core/stdlib/action
 *
 * Action components - handle user interaction and trigger discrete actions.
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

import { ButtonPlugin } from "./button";
import { CheckboxPlugin } from "./checkbox";
import { InputPlugin } from "./input";
// Plugin kit for easy registration
import { LiveActionPlugin } from "./live-action";
import { SelectPlugin } from "./select";
import { TextareaPlugin } from "./textarea";

export const ActionKit = [
  LiveActionPlugin,
  ButtonPlugin,
  InputPlugin,
  SelectPlugin,
  CheckboxPlugin,
  TextareaPlugin,
] as const;
