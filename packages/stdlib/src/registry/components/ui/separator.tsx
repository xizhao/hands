/**
 * @component separator
 * @name Separator
 * @category ui-layout
 * @description A line that divides content into distinct sections.
 * @icon minus
 * @keywords separator, divider, line, hr, horizontal, vertical
 * @example
 * <div>
 *   <div>Section 1</div>
 *   <Separator className="my-4" />
 *   <div>Section 2</div>
 * </div>
 */
import * as SeparatorPrimitive from "@radix-ui/react-separator";
import * as React from "react";

import { cn } from "../../../lib/utils";

const Separator = React.forwardRef<
  React.ElementRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(({ className, orientation = "horizontal", decorative = true, ...props }, ref) => (
  <SeparatorPrimitive.Root
    ref={ref}
    decorative={decorative}
    orientation={orientation}
    className={cn(
      "shrink-0 bg-border",
      orientation === "horizontal" ? "h-[1px] w-full" : "h-full w-[1px]",
      className,
    )}
    {...props}
  />
));
Separator.displayName = SeparatorPrimitive.Root.displayName;

export { Separator };
