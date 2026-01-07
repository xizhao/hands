/**
 * LandingInput - Lightweight input for landing page
 *
 * This is a simplified version of ChatInput that doesn't pull in
 * heavy @hands/app dependencies. It only needs basic textarea + send button.
 */

import { ArrowUp, Loader2 } from "lucide-react";
import { forwardRef, useCallback, useImperativeHandle, useRef, type KeyboardEvent } from "react";
import { cn } from "@hands/app/light";

export interface LandingInputRef {
  focus: () => void;
  blur: () => void;
}

interface LandingInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  isSending?: boolean;
  placeholder?: string;
  className?: string;
}

export const LandingInput = forwardRef<LandingInputRef, LandingInputProps>(
  function LandingInput({ value, onChange, onSend, isSending = false, placeholder, className }, ref) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus(),
      blur: () => textareaRef.current?.blur(),
    }));

    const handleKeyDown = useCallback(
      (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          if (value.trim() && !isSending) {
            onSend();
          }
        }
      },
      [value, isSending, onSend]
    );

    const handleInput = useCallback(() => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.style.height = "auto";
        textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
      }
    }, []);

    const canSend = value.trim().length > 0 && !isSending;

    return (
      <div className={cn("flex items-end gap-2", className)}>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder={placeholder}
          rows={1}
          className={cn(
            "flex-1 resize-none bg-transparent text-sm leading-relaxed",
            "placeholder:text-muted-foreground/60",
            "focus:outline-none",
            "min-h-[24px] max-h-[120px] py-1"
          )}
        />
        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          className={cn(
            "shrink-0 w-8 h-8 rounded-lg flex items-center justify-center",
            "transition-all duration-150",
            canSend
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          )}
        >
          {isSending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ArrowUp className="w-4 h-4" />
          )}
        </button>
      </div>
    );
  }
);
