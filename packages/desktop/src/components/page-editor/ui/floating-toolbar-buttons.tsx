"use client";

import { Lightning } from "@phosphor-icons/react";
import { useEditorReadOnly, useEditorRef, usePluginOption } from "platejs/react";
import { useCallback } from "react";

import { useActiveSession } from "@/hooks/useNavState";
import { useCreateSession, useSendMessage } from "@/hooks/useSession";

import { PageContextPlugin } from "../plugins/page-context-kit";
import { ToolbarButton } from "./toolbar";

/**
 * "Make Live" button for the floating toolbar.
 *
 * When clicked with text selected:
 * 1. Gets the selected text and page context
 * 2. Starts a Hands thread with a prompt to convert to live data
 * 3. Hands will create the SQL and replace with <LiveValue sql={...}/>
 */
function MakeLiveToolbarButton() {
  const editor = useEditorRef();
  const pageId = usePluginOption(PageContextPlugin, "pageId");
  const pageTitle = usePluginOption(PageContextPlugin, "title");

  const { sessionId: activeSessionId, setSession: setActiveSession } = useActiveSession();
  const createSession = useCreateSession();
  const sendMessage = useSendMessage();

  const handleMakeLive = useCallback(async () => {
    // Get selected text
    const selection = editor.selection;
    if (!selection) return;

    const selectedText = editor.api.string(selection);
    if (!selectedText) return;

    // Build the prompt for Hands
    const prompt = `Make this text live by converting it to a database-backed value.

**Selected text:** "${selectedText}"
**Page:** ${pageTitle || "Untitled"} (source://${pageId})

Instructions:
1. Analyze the selected text to understand what data it represents
2. Create or identify the appropriate table/column in the database to store this data
3. Edit the page source (source://${pageId}) to replace the selected text with a <LiveValue query="SELECT ..." /> component
4. The LiveValue should query the database to display this data dynamically

The selected text "${selectedText}" should be replaced with a live query that fetches this value from the database.`;

    console.log("[MakeLive] Starting with prompt:", prompt);

    // Create session if needed, then send message
    let sessionId = activeSessionId;
    if (!sessionId) {
      try {
        const newSession = await createSession.mutateAsync({
          title: `Make Live: ${selectedText.slice(0, 30)}...`,
        });
        sessionId = newSession.id;
        setActiveSession(sessionId);
      } catch (err) {
        console.error("[MakeLive] Failed to create session:", err);
        return;
      }
    }

    // Send the message to Hands
    try {
      await sendMessage.mutateAsync({
        sessionId,
        content: prompt,
      });
    } catch (err) {
      console.error("[MakeLive] Failed to send message:", err);
    }
  }, [editor, pageId, pageTitle, activeSessionId, createSession, sendMessage, setActiveSession]);

  const isLoading = createSession.isPending || sendMessage.isPending;

  return (
    <ToolbarButton
      onClick={handleMakeLive}
      onMouseDown={(e) => e.preventDefault()}
      tooltip="Make Live - Convert to database-backed value"
      className="gap-1.5 px-2"
      disabled={isLoading}
    >
      <Lightning
        weight="fill"
        className={`size-4 text-violet-500 ${isLoading ? "animate-pulse" : ""}`}
      />
      <span className="text-xs font-medium">
        {isLoading ? "Working..." : "Make Live"}
      </span>
    </ToolbarButton>
  );
}

export function FloatingToolbarButtons() {
  const readOnly = useEditorReadOnly();

  if (readOnly) {
    return null;
  }

  return (
    <div className="flex items-center">
      <MakeLiveToolbarButton />
    </div>
  );
}
