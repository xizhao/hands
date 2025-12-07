import { memo, useMemo } from "react";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { cn } from "@/lib/utils";

interface ShimmeringTextProps {
  text: string;
  className?: string;
  duration?: number;
  spread?: number;
  disabled?: boolean;
}

export const ShimmeringText = memo(({
  text,
  className,
  duration = 2,
  spread = 2,
  disabled = false,
}: ShimmeringTextProps) => {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: false, amount: 0.5 });

  const dynamicSpread = useMemo(() => {
    const len = text.length;
    return Math.min(spread + len * 0.03, 4);
  }, [text, spread]);

  if (disabled) {
    return <span className={className}>{text}</span>;
  }

  return (
    <motion.span
      ref={ref}
      className={cn("inline-block", className)}
      style={{
        backgroundImage: `linear-gradient(
          90deg,
          currentColor 0%,
          currentColor 40%,
          hsl(var(--primary)) 50%,
          currentColor 60%,
          currentColor 100%
        )`,
        backgroundSize: `${dynamicSpread * 100}% 100%`,
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        WebkitTextFillColor: "transparent",
      }}
      initial={{ backgroundPosition: "100% center" }}
      animate={isInView ? { backgroundPosition: "-100% center" } : {}}
      transition={{
        duration,
        ease: "linear",
        repeat: Infinity,
      }}
    >
      {text}
    </motion.span>
  );
});

ShimmeringText.displayName = "ShimmeringText";
