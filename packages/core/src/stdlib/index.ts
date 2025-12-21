/**
 * @hands/core/stdlib
 *
 * Hands Standard Library - Components for building interactive data applications.
 *
 * ## Categories
 *
 * ### Static Components
 * Display-only components that render data without user interaction.
 * - `LiveValue` - Display SQL query results (inline/list/table)
 *
 * ### Active Components
 * Interactive components that handle user input and execute SQL mutations.
 * - `LiveAction` - Container for form controls that executes SQL on submit
 * - `ActionButton` - Button to trigger parent action
 * - `ActionInput` - Text input with form binding
 * - `ActionSelect` - Dropdown with form binding
 * - `ActionCheckbox` - Checkbox with form binding
 * - `ActionTextarea` - Multiline text with form binding
 */

// Re-export static components
export * from "./static";

// Re-export active components
export * from "./active";

// Convenience kit exports
import { LiveValuePlugin } from "./static";
import { ActiveKit } from "./active";

/**
 * Static component plugins for Plate editor.
 */
export const StaticKit = [LiveValuePlugin] as const;

/**
 * All stdlib plugins for Plate editor.
 */
export const StdlibKit = [...StaticKit, ...ActiveKit] as const;

export { ActiveKit };
