// Auto-generated actions manifest - DO NOT EDIT
import type { ActionDefinition } from "@hands/runtime";


export const actions: Record<string, ActionDefinition> = {

};

export type ActionId = keyof typeof actions;

export function getAction(id: string): ActionDefinition | undefined {
  return actions[id];
}

export function listActions(): Array<{ id: string; definition: ActionDefinition }> {
  return Object.entries(actions).map(([id, definition]) => ({ id, definition }));
}
