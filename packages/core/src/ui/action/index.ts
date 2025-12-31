/**
 * @hands/core/stdlib/action
 *
 * Action components - form controls and user interaction.
 */

// Form controls
export {
  BUTTON_KEY,
  Button,
  ButtonMeta,
  ButtonPlugin,
  type ButtonProps,
  createButtonElement,
} from "./button";

export {
  CHECKBOX_KEY,
  Checkbox,
  CheckboxMeta,
  CheckboxPlugin,
  type CheckboxProps,
  createCheckboxElement,
} from "./checkbox";

export {
  createInputElement,
  INPUT_KEY,
  Input,
  InputMeta,
  InputPlugin,
  type InputProps,
} from "./input";
// LiveAction container
export {
  createLiveActionElement,
  LIVE_ACTION_KEY,
  LiveAction,
  LiveActionContext,
  LiveActionMeta,
  LiveActionPlugin,
  type LiveActionProps,
  substituteFormBindings,
  useLiveAction,
  useLiveActionOptional,
} from "./live-action";
export {
  createSelectElement,
  SELECT_KEY,
  Select,
  SelectMeta,
  type SelectOption,
  SelectPlugin,
  type SelectProps,
} from "./select";
export {
  createTextareaElement,
  TEXTAREA_KEY,
  Textarea,
  TextareaMeta,
  TextareaPlugin,
  type TextareaProps,
} from "./textarea";

// Plugin kit for easy registration
import { ButtonPlugin } from "./button";
import { CheckboxPlugin } from "./checkbox";
import { InputPlugin } from "./input";
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
