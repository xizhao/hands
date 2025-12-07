import { memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface StreamingTextProps {
  text: string;
  isStreaming?: boolean;
  className?: string;
  cursorClassName?: string;
  speed?: number; // characters per second for simulated streaming
}

// Typing cursor component
const TypingCursor = memo(({ className }: { className?: string }) => (
  <motion.span
    className={cn(
      "inline-block w-[2px] h-[1.1em] bg-primary ml-0.5 align-middle",
      className
    )}
    animate={{ opacity: [1, 0] }}
    transition={{
      duration: 0.5,
      repeat: Infinity,
      repeatType: "reverse",
      ease: "easeInOut",
    }}
  />
));

TypingCursor.displayName = "TypingCursor";

// Streaming text with cursor
export const StreamingText = memo(({
  text,
  isStreaming = false,
  className,
  cursorClassName,
}: StreamingTextProps) => {
  return (
    <span className={cn("relative", className)}>
      {text}
      <AnimatePresence>
        {isStreaming && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <TypingCursor className={cursorClassName} />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
});

StreamingText.displayName = "StreamingText";

// Animated text reveal - each word fades in
interface AnimatedTextRevealProps {
  text: string;
  className?: string;
  delay?: number;
  stagger?: number;
}

export const AnimatedTextReveal = memo(({
  text,
  className,
  delay = 0,
  stagger = 0.02,
}: AnimatedTextRevealProps) => {
  const words = text.split(" ");

  return (
    <span className={className}>
      {words.map((word, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.2,
            delay: delay + i * stagger,
            ease: "easeOut",
          }}
          className="inline-block"
        >
          {word}
          {i < words.length - 1 && " "}
        </motion.span>
      ))}
    </span>
  );
});

AnimatedTextReveal.displayName = "AnimatedTextReveal";

// Gradient streaming text with shimmer effect
interface GradientStreamingTextProps {
  text: string;
  isStreaming?: boolean;
  className?: string;
}

export const GradientStreamingText = memo(({
  text,
  isStreaming = false,
  className,
}: GradientStreamingTextProps) => {
  if (!isStreaming) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={cn("relative", className)}>
      <motion.span
        className="inline"
        style={{
          backgroundImage: `linear-gradient(
            90deg,
            hsl(var(--foreground)) 0%,
            hsl(var(--foreground)) 40%,
            hsl(var(--primary)) 50%,
            hsl(var(--foreground)) 60%,
            hsl(var(--foreground)) 100%
          )`,
          backgroundSize: "200% 100%",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
        animate={{ backgroundPosition: ["100% center", "-100% center"] }}
        transition={{
          duration: 1.5,
          ease: "linear",
          repeat: Infinity,
        }}
      >
        {text}
      </motion.span>
      <TypingCursor />
    </span>
  );
});

GradientStreamingText.displayName = "GradientStreamingText";
