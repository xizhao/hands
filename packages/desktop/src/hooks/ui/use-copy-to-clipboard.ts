// Simple clipboard hook without sonner toast
import { useCallback, useState } from 'react';

export interface UseCopyToClipboardProps {
  timeout?: number;
}

export function useCopyToClipboard({ timeout = 2000 }: UseCopyToClipboardProps = {}) {
  const [isCopied, setIsCopied] = useState(false);

  const copyToClipboard = useCallback(
    (value: string) => {
      if (typeof window === 'undefined' || !navigator.clipboard?.writeText) {
        return;
      }

      navigator.clipboard.writeText(value).then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), timeout);
      });
    },
    [timeout]
  );

  return { isCopied, copyToClipboard };
}
