import { cva, type VariantProps } from "class-variance-authority";
import { Loader2Icon, type LucideProps } from "lucide-react";

import { cn } from "@/lib/utils";

const spinnerVariants = cva("animate-spin text-muted-foreground", {
  defaultVariants: {
    size: "default",
  },
  variants: {
    size: {
      default: "size-4",
      icon: "size-10",
      lg: "size-6",
      sm: "size-2",
    },
  },
});

export function Spinner({
  className,
  size,
  ...props
}: Partial<LucideProps & VariantProps<typeof spinnerVariants>>) {
  return <Loader2Icon className={cn(spinnerVariants({ size }), className)} {...props} />;
}

/**
 * Centered loading state with spinner - use for full-container loading
 */
export function LoadingState({
  size = "default",
  className,
}: {
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}) {
  return (
    <div className={cn("h-full flex items-center justify-center", className)}>
      <Spinner size={size} />
    </div>
  );
}
