/**
 * @hands/core/stdlib/action
 *
 * Action components - form controls and user interaction.
 */

// Form controls
export {
  Button,
  type ButtonProps,
  BUTTON_KEY,
  ButtonPlugin,
  createButtonElement,
  ButtonMeta,
} from "./button";

export {
  Checkbox,
  type CheckboxProps,
  CHECKBOX_KEY,
  CheckboxPlugin,
  createCheckboxElement,
  CheckboxMeta,
} from "./checkbox";

export {
  Input,
  type InputProps,
  INPUT_KEY,
  InputPlugin,
  createInputElement,
  InputMeta,
} from "./input";

export {
  Select,
  type SelectProps,
  SELECT_KEY,
  type SelectOption,
  SelectPlugin,
  createSelectElement,
  SelectMeta,
} from "./select";

export {
  Textarea,
  type TextareaProps,
  TEXTAREA_KEY,
  TextareaPlugin,
  createTextareaElement,
  TextareaMeta,
} from "./textarea";

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
  LiveActionMeta,
} from "./live-action";

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
