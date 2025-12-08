import { memo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Brain, Sparkles } from "lucide-react";

// Shimmer text effect - gradient sweeps across text
interface ShimmerTextProps {
  text: string;
  className?: string;
}

export const ShimmerText = memo(({ text, className }: ShimmerTextProps) => (
  <span
    className={cn(
      "inline-block bg-clip-text text-transparent",
      "bg-[length:200%_100%]",
      "animate-shimmer",
      className
    )}
    style={{
      backgroundImage: "linear-gradient(90deg, hsl(var(--muted-foreground)) 0%, hsl(var(--foreground)) 50%, hsl(var(--muted-foreground)) 100%)",
    }}
  >
    {text}
  </span>
));

ShimmerText.displayName = "ShimmerText";

interface ThinkingIndicatorProps {
  className?: string;
  variant?: "dots" | "pulse" | "sparkle" | "brain";
  text?: string;
  size?: "sm" | "md" | "lg";
}

// Animated dots (ChatGPT style)
const ThinkingDots = memo(({ className }: { className?: string }) => (
  <span className={cn("inline-flex items-center gap-0.5", className)}>
    {[0, 1, 2].map((i) => (
      <motion.span
        key={i}
        className="w-1.5 h-1.5 rounded-full bg-current"
        animate={{
          opacity: [0.3, 1, 0.3],
          scale: [0.8, 1, 0.8],
        }}
        transition={{
          duration: 1,
          repeat: Infinity,
          delay: i * 0.15,
          ease: "easeInOut",
        }}
      />
    ))}
  </span>
));

ThinkingDots.displayName = "ThinkingDots";

// Pulsing ring effect
const PulseRing = memo(({ className }: { className?: string }) => (
  <span className={cn("relative inline-flex h-4 w-4", className)}>
    <motion.span
      className="absolute inset-0 rounded-full bg-primary/30"
      animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
    />
    <span className="relative inline-flex rounded-full h-full w-full bg-primary/50" />
  </span>
));

PulseRing.displayName = "PulseRing";

// Sparkle effect
const SparkleEffect = memo(({ className }: { className?: string }) => (
  <motion.span
    className={cn("inline-flex", className)}
    animate={{ rotate: [0, 15, -15, 0] }}
    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
  >
    <Sparkles className="h-4 w-4 text-primary" />
  </motion.span>
));

SparkleEffect.displayName = "SparkleEffect";

// Brain thinking animation
const BrainThinking = memo(({ className }: { className?: string }) => (
  <motion.span
    className={cn("inline-flex", className)}
    animate={{ scale: [1, 1.1, 1] }}
    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
  >
    <Brain className="h-4 w-4 text-purple-400" />
  </motion.span>
));

BrainThinking.displayName = "BrainThinking";

export const ThinkingIndicator = memo(({
  className,
  variant = "dots",
  text = "Thinking",
  size = "md",
}: ThinkingIndicatorProps) => {
  const sizeClasses = {
    sm: "text-xs gap-1.5",
    md: "text-sm gap-2",
    lg: "text-base gap-2.5",
  };

  const iconComponent = {
    dots: <ThinkingDots />,
    pulse: <PulseRing />,
    sparkle: <SparkleEffect />,
    brain: <BrainThinking />,
  }[variant];

  return (
    <div className={cn(
      "inline-flex items-center text-muted-foreground",
      sizeClasses[size],
      className
    )}>
      {iconComponent}
      <motion.span
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      >
        {text}
      </motion.span>
    </div>
  );
});

ThinkingIndicator.displayName = "ThinkingIndicator";

// Premium loading state with gradient border
interface LoadingCardProps {
  className?: string;
  children?: React.ReactNode;
}

export const LoadingCard = memo(({ className, children }: LoadingCardProps) => (
  <div className={cn("relative p-[1px] rounded-lg overflow-hidden", className)}>
    {/* Animated gradient border */}
    <motion.div
      className="absolute inset-0"
      style={{
        background: "linear-gradient(90deg, hsl(var(--primary)), hsl(var(--primary)/0.5), hsl(var(--primary)))",
        backgroundSize: "200% 100%",
      }}
      animate={{ backgroundPosition: ["0% center", "200% center"] }}
      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
    />
    {/* Content */}
    <div className="relative bg-background rounded-lg p-3">
      {children}
    </div>
  </div>
));

LoadingCard.displayName = "LoadingCard";

// Skeleton loading with shimmer
interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
}

export const Skeleton = memo(({ className, width, height }: SkeletonProps) => (
  <motion.div
    className={cn("rounded bg-muted overflow-hidden", className)}
    style={{ width, height }}
  >
    <motion.div
      className="h-full w-full"
      style={{
        background: "linear-gradient(90deg, transparent, hsl(var(--muted-foreground)/0.1), transparent)",
        backgroundSize: "200% 100%",
      }}
      animate={{ backgroundPosition: ["-100% center", "200% center"] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
    />
  </motion.div>
));

Skeleton.displayName = "Skeleton";
