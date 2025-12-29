/**
 * Speech-to-text hook using Parakeet TDT model.
 *
 * Hold Option key to record, release to transcribe.
 */

import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";

interface UseSttOptions {
  onTranscription?: (text: string) => void;
  onError?: (error: string) => void;
}

interface UseSttReturn {
  isRecording: boolean;
  isModelAvailable: boolean;
  modelPath: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string>;
}

export function useStt(options: UseSttOptions = {}): UseSttReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isModelAvailable, setIsModelAvailable] = useState(false);
  const [modelPath, setModelPath] = useState<string | null>(null);

  // Check model availability on mount
  useEffect(() => {
    const checkModel = async () => {
      try {
        const available = await invoke<boolean>("stt_model_available");
        setIsModelAvailable(available);

        const path = await invoke<string>("stt_model_path");
        setModelPath(path);
      } catch (err) {
        console.error("[stt] Failed to check model:", err);
      }
    };
    checkModel();
  }, []);

  const startRecording = useCallback(async () => {
    try {
      await invoke("stt_start_recording");
      setIsRecording(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      options.onError?.(message);
      console.error("[stt] Failed to start recording:", err);
    }
  }, [options]);

  const stopRecording = useCallback(async (): Promise<string> => {
    try {
      const text = await invoke<string>("stt_stop_recording");
      setIsRecording(false);
      if (text) {
        options.onTranscription?.(text);
      }
      return text;
    } catch (err) {
      setIsRecording(false);
      const message = err instanceof Error ? err.message : String(err);
      options.onError?.(message);
      console.error("[stt] Failed to stop recording:", err);
      return "";
    }
  }, [options]);

  return {
    isRecording,
    isModelAvailable,
    modelPath,
    startRecording,
    stopRecording,
  };
}

/**
 * Hook to handle Option-key press-to-talk.
 * Returns whether the Option key is currently held.
 */
export function useOptionKeyRecording(options: UseSttOptions = {}) {
  const stt = useStt(options);
  const [isOptionHeld, setIsOptionHeld] = useState(false);

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Option/Alt key
      if (e.key === "Alt" && !e.repeat && !stt.isRecording) {
        setIsOptionHeld(true);
        await stt.startRecording();
      }
    };

    const handleKeyUp = async (e: KeyboardEvent) => {
      if (e.key === "Alt" && stt.isRecording) {
        setIsOptionHeld(false);
        await stt.stopRecording();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [stt]);

  return {
    ...stt,
    isOptionHeld,
  };
}
