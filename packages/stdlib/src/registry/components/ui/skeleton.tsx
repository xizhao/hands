/**
 * @component skeleton
 * @name Skeleton
 * @category ui-feedback
 * @description A placeholder animation shown while content is loading.
 * @icon box
 * @keywords skeleton, loading, placeholder, shimmer, loader
 * @example
 * <div className="flex items-center space-x-4">
 *   <Skeleton className="h-12 w-12 rounded-full" />
 *   <div className="space-y-2">
 *     <Skeleton className="h-4 w-[250px]" />
 *     <Skeleton className="h-4 w-[200px]" />
 *   </div>
 * </div>
 */
import { cn } from "../../../lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-primary/10", className)} {...props} />;
}

export { Skeleton };
