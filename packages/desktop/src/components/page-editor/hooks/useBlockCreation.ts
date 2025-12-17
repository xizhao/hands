/**
 * useBlockCreation - Hook to manage AI-driven block creation
 *
 * Watches for editing blocks in the Plate editor and:
 * 1. Creates a new session
 * 2. Sends a prompt to the "hands" agent to build the block
 * 3. Watches for session completion
 * 4. Updates the block element with the created block's src
 */

import { useCallback, useEffect, useRef } from "react";
import type { PlateEditor } from "platejs/react";
import { useCreateSession, useSendMessage, useSessionStatuses } from "@/hooks/useSession";
import { useManifest } from "@/hooks/useRuntimeState";
import { SANDBOXED_BLOCK_KEY, type TSandboxedBlockElement } from "../SandboxedBlock";

interface BlockCreationTask {
  /** Unique ID for this task (element ID) */
  elementId: string;
  /** The prompt from the user */
  prompt: string;
  /** Session ID handling this task */
  sessionId: string | null;
  /** Status of the task */
  status: "pending" | "creating_session" | "sending_prompt" | "waiting" | "completed" | "error";
  /** Error message if failed */
  error?: string;
  /** Expected block ID (generated from prompt) */
  expectedBlockId?: string;
}

/**
 * Generate a block ID from a prompt
 */
function generateBlockId(prompt: string): string {
  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

/**
 * Build the system prompt for the AI to create a block
 */
function buildSystemPrompt(blockId: string, prompt: string): string {
  return `You are creating a Hands block for a data notebook.

TASK: Create a React component block based on the user's request.

BLOCK ID: ${blockId}

The block should be created at: blocks/${blockId}.tsx

IMPORTANT REQUIREMENTS:
1. Create a single .tsx file that exports a default React component
2. Use the @hands/runtime types for proper typing
3. If data visualization is needed, use recharts or simple SVG
4. Keep the component self-contained
5. Use Tailwind CSS for styling
6. The component should be responsive

After creating the block, confirm completion by saying: "Block created: ${blockId}"

USER REQUEST: ${prompt}`;
}

export interface UseBlockCreationOptions {
  /** Plate editor instance */
  editor: PlateEditor;
  /** Page ID (for context in AI prompt) */
  pageId?: string;
  /** Callback when a block is created */
  onBlockCreated?: (elementId: string, blockId: string) => void;
  /** Callback when block creation fails */
  onBlockError?: (elementId: string, error: string) => void;
}

export function useBlockCreation({
  editor,
  pageId,
  onBlockCreated,
  onBlockError,
}: UseBlockCreationOptions) {
  // Track active creation tasks
  const tasksRef = useRef<Map<string, BlockCreationTask>>(new Map());
  const processedElementsRef = useRef<Set<string>>(new Set());

  // Hooks for session management
  const createSession = useCreateSession();
  const sendMessage = useSendMessage();
  const { data: statuses } = useSessionStatuses();
  const { data: manifest } = useManifest();

  /**
   * Find all editing blocks in the editor
   */
  const findEditingBlocks = useCallback((): Array<{
    element: TSandboxedBlockElement;
    path: number[];
  }> => {
    const editingBlocks: Array<{ element: TSandboxedBlockElement; path: number[] }> = [];

    try {
      const nodes = editor.api.nodes({
        match: (n: any) => n.type === SANDBOXED_BLOCK_KEY && n.editing === true,
      });

      for (const [node, path] of nodes) {
        editingBlocks.push({
          element: node as TSandboxedBlockElement,
          path: path as number[],
        });
      }
    } catch (err) {
      console.error("[useBlockCreation] Error finding editing blocks:", err);
    }

    return editingBlocks;
  }, [editor]);

  /**
   * Update a block element to mark it as complete
   */
  const completeBlock = useCallback(
    (path: number[], blockId: string) => {
      try {
        editor.tf.setNodes(
          {
            editing: false,
            prompt: undefined,
            src: blockId,
          } as Partial<TSandboxedBlockElement>,
          { at: path }
        );
        console.log("[useBlockCreation] Block completed:", blockId);
      } catch (err) {
        console.error("[useBlockCreation] Error completing block:", err);
      }
    },
    [editor]
  );

  /**
   * Start block creation for an editing element
   */
  const startBlockCreation = useCallback(
    async (element: TSandboxedBlockElement, path: number[]) => {
      const elementKey = path.join("-");

      // Skip if already processed
      if (processedElementsRef.current.has(elementKey)) {
        return;
      }

      const prompt = element.prompt;
      if (!prompt) {
        console.warn("[useBlockCreation] No prompt for editing block");
        return;
      }

      // Mark as processed
      processedElementsRef.current.add(elementKey);

      // Generate block ID
      const blockId = generateBlockId(prompt);

      // Create task
      const task: BlockCreationTask = {
        elementId: elementKey,
        prompt,
        sessionId: null,
        status: "creating_session",
        expectedBlockId: blockId,
      };
      tasksRef.current.set(elementKey, task);

      console.log("[useBlockCreation] Starting block creation:", { blockId, prompt });

      try {
        // Create a new session
        const session = await createSession.mutateAsync({
          title: `Create block: ${blockId}`,
        });

        task.sessionId = session.id;
        task.status = "sending_prompt";

        // Send the prompt with system instructions
        const systemPrompt = buildSystemPrompt(blockId, prompt);
        await sendMessage.mutateAsync({
          sessionId: session.id,
          content: prompt,
          system: systemPrompt,
          agent: "hands",
        });

        task.status = "waiting";
        console.log("[useBlockCreation] Prompt sent, waiting for completion");
      } catch (err) {
        task.status = "error";
        task.error = err instanceof Error ? err.message : String(err);
        console.error("[useBlockCreation] Error creating block:", err);
        onBlockError?.(elementKey, task.error);

        // Remove from processed so user can retry
        processedElementsRef.current.delete(elementKey);
      }
    },
    [createSession, sendMessage, onBlockError]
  );

  /**
   * Check for new editing blocks and start creation
   */
  useEffect(() => {
    const checkForEditingBlocks = () => {
      const editingBlocks = findEditingBlocks();

      for (const { element, path } of editingBlocks) {
        const elementKey = path.join("-");
        if (!processedElementsRef.current.has(elementKey)) {
          startBlockCreation(element, path);
        }
      }
    };

    // Check immediately
    checkForEditingBlocks();

    // Poll for changes (Plate doesn't have a direct subscribe API)
    const interval = setInterval(checkForEditingBlocks, 500);

    return () => {
      clearInterval(interval);
    };
  }, [findEditingBlocks, startBlockCreation]);

  /**
   * Watch for session completion and manifest updates
   */
  useEffect(() => {
    if (!statuses || !manifest) return;

    for (const [elementKey, task] of tasksRef.current.entries()) {
      if (task.status !== "waiting" || !task.sessionId) continue;

      const sessionStatus = statuses[task.sessionId];
      if (!sessionStatus || sessionStatus.type !== "idle") continue;

      // Session completed - check if block was created
      const expectedBlockId = task.expectedBlockId;
      if (!expectedBlockId) continue;

      // Look for the block in the manifest
      const createdBlock = manifest.blocks?.find(
        (b) => b.id === expectedBlockId || b.id.includes(expectedBlockId)
      );

      if (createdBlock) {
        // Block was created - update the element
        task.status = "completed";

        // Find the element by path
        const editingBlocks = findEditingBlocks();
        for (const { element, path } of editingBlocks) {
          const key = path.join("-");
          if (key === elementKey || element.prompt === task.prompt) {
            completeBlock(path, createdBlock.id);
            onBlockCreated?.(elementKey, createdBlock.id);
            break;
          }
        }

        // Clean up
        tasksRef.current.delete(elementKey);
        console.log("[useBlockCreation] Block creation completed:", createdBlock.id);
      } else {
        // Session completed but block not found - might need more time for manifest update
        // The manifest SSE should update soon
        console.log("[useBlockCreation] Waiting for manifest update...");
      }
    }
  }, [statuses, manifest, findEditingBlocks, completeBlock, onBlockCreated]);

  return {
    /** Get all active creation tasks */
    tasks: () => Array.from(tasksRef.current.values()),
    /** Check if any block creation is in progress */
    isCreating: () => {
      for (const task of tasksRef.current.values()) {
        if (task.status === "waiting" || task.status === "sending_prompt") {
          return true;
        }
      }
      return false;
    },
  };
}
