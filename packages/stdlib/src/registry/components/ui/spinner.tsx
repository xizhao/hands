/**
 * @component spinner
 * @name Spinner
 * @category ui-feedback
 * @description An animated spinning icon to indicate loading or processing.
 * @icon loader-2
 * @keywords spinner, loading, loader, progress, wait
 * @example
 * <Spinner className="h-6 w-6" />
 */
import { Loader2Icon } from "lucide-react";

import { cn } from "../../../lib/utils";

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <Loader2Icon
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };
