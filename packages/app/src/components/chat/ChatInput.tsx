/**
 * ChatInput - Message input bar with attachments and STT
 *
 * Features:
 * - Auto-resizing textarea
 * - STT recording indicator
 * - Attachment menu
 * - Submit/abort buttons
 */

import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, Loader2, Square } from "lucide-react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";
import { AttachmentMenu } from "@/components/AttachmentMenu";
import { useFilePicker } from "@/hooks/useFilePicker";

export interface ChatInputRef {
  focus: () => void;
  blur: () => void;
}

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onAbort?: () => void;
  isBusy?: boolean;
  isSending?: boolean;
  isRecording?: boolean;
  sttPreview?: string;
  pendingFiles?: string[];
  onPendingFilesChange?: (files: string[]) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
}

export const ChatInput = forwardRef<ChatInputRef, ChatInputProps>(function ChatInput(
  {
    value,
    onChange,
    onSend,
    onAbort,
    isBusy = false,
    isSending = false,
    isRecording = false,
    sttPreview = "",
    pendingFiles = [],
    onPendingFilesChange,
    onFocus,
    onBlur,
    placeholder = "Ask anything...",
    className = "",
  },
  ref,
) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    blur: () => inputRef.current?.blur(),
  }));

  // Auto-resize textarea as content grows
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
      // Reset height to auto to get the correct scrollHeight
      e.target.style.height = "auto";
      // Set height to scrollHeight, capped at max
      const maxHeight = 120; // ~5 lines
      e.target.style.height = `${Math.min(e.target.scrollHeight, maxHeight)}px`;
    },
    [onChange],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  // Attachment handlers
  const { handlePickFile, handlePickFolder, handleSnapshot } = useFilePicker({
    onFileSelected: (path) => onPendingFilesChange?.([...pendingFiles, path]),
    onFolderSelected: (path) => onPendingFilesChange?.([...pendingFiles, path]),
  });

  const handleRemoveFile = (index: number) => {
    onPendingFilesChange?.(pendingFiles.filter((_, i) => i !== index));
  };

  const hasContent = value.trim() || pendingFiles.length > 0;

  return (
    <div className={`flex items-end gap-1 ${className}`}>
      {/* Text input - auto-resizing textarea */}
      <textarea
        ref={inputRef}
        value={isRecording && sttPreview ? sttPreview : value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={isRecording ? "Listening..." : placeholder}
        rows={1}
        readOnly={isRecording}
        className={`flex-1 bg-transparent py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none min-w-0 resize-none overflow-y-auto ${
          isRecording ? "placeholder:text-red-400 text-red-300" : ""
        }`}
        style={{ maxHeight: "120px" }}
      />

      {/* Attachment dropdown */}
      <AttachmentMenu
        onSnapshot={handleSnapshot}
        onPickFile={handlePickFile}
        onPickFolder={handlePickFolder}
        pendingFiles={pendingFiles}
        onRemoveFile={handleRemoveFile}
        triggerClassName="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0 self-center relative"
      />

      {/* Submit/Abort button */}
      <AnimatePresence mode="wait">
        {isBusy ? (
          <motion.button
            key="abort"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            onClick={onAbort}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-red-400 hover:text-red-300 shrink-0 self-center"
          >
            <Square className="h-4 w-4" />
          </motion.button>
        ) : (
          <motion.button
            key="send"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            onClick={onSend}
            disabled={!hasContent}
            className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 self-center transition-colors ${
              hasContent
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "text-muted-foreground"
            }`}
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
});
