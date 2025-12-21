/**
 * @hands/core/stdlib/active
 *
 * Active components - handle user interaction and execute SQL mutations.
 */

// LiveAction container
export {
  LiveActionPlugin,
  LiveAction,
  LiveActionContext,
  useLiveAction,
  useLiveActionOptional,
  createLiveActionElement,
  substituteFormBindings,
  LIVE_ACTION_KEY,
  type LiveActionProps,
} from "./live-action";

// Form controls
export {
  ButtonPlugin,
  ActionButton,
  createButtonElement,
  BUTTON_KEY,
  type ActionButtonProps,
} from "./button";

export {
  InputPlugin,
  ActionInput,
  createInputElement,
  INPUT_KEY,
  type ActionInputProps,
} from "./input";

export {
  SelectPlugin,
  ActionSelect,
  createSelectElement,
  SELECT_KEY,
  type ActionSelectProps,
  type SelectOption,
} from "./select";

export {
  CheckboxPlugin,
  ActionCheckbox,
  createCheckboxElement,
  CHECKBOX_KEY,
  type ActionCheckboxProps,
} from "./checkbox";

export {
  TextareaPlugin,
  ActionTextarea,
  createTextareaElement,
  TEXTAREA_KEY,
  type ActionTextareaProps,
} from "./textarea";

// Plugin kit for easy registration
import { LiveActionPlugin } from "./live-action";
import { ButtonPlugin } from "./button";
import { InputPlugin } from "./input";
import { SelectPlugin } from "./select";
import { CheckboxPlugin } from "./checkbox";
import { TextareaPlugin } from "./textarea";

export const ActiveKit = [
  LiveActionPlugin,
  ButtonPlugin,
  InputPlugin,
  SelectPlugin,
  CheckboxPlugin,
  TextareaPlugin,
] as const;
