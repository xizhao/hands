/**
 * @component collapsible
 * @name Collapsible
 * @category ui-layout
 * @description Expand and collapse content sections interactively.
 * @icon fold-vertical
 * @keywords collapsible, expand, collapse
 * @example
 * <Collapsible>
 *   <CollapsibleTrigger>Toggle</CollapsibleTrigger>
 *   <CollapsibleContent>Hidden content here.</CollapsibleContent>
 * </Collapsible>
 */
"use client";

import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";

const Collapsible = CollapsiblePrimitive.Root;

const CollapsibleTrigger = CollapsiblePrimitive.CollapsibleTrigger;

const CollapsibleContent = CollapsiblePrimitive.CollapsibleContent;

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
