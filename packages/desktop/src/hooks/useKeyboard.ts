import { useEffect } from "react";
import { useActiveSession } from "@/hooks/useNavState";
import { useCreateSession, useAbortSession } from "@/hooks/useSession";

export function useKeyboard() {
  const { sessionId: activeSessionId, setSession: setActiveSession } = useActiveSession();
  const createSession = useCreateSession();
  const abortSession = useAbortSession(activeSessionId);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + T: New tab/session
      if ((e.metaKey || e.ctrlKey) && e.key === "t") {
        e.preventDefault();
        createSession.mutate(undefined, {
          onSuccess: (session) => {
            setActiveSession(session.id);
          },
        });
      }

      // Cmd/Ctrl + N: Also new session
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        createSession.mutate(undefined, {
          onSuccess: (session) => {
            setActiveSession(session.id);
          },
        });
      }

      // Escape: Abort current session
      if (e.key === "Escape" && activeSessionId) {
        abortSession.mutate();
      }

      // Cmd/Ctrl + /: Focus input
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        const input = document.querySelector("textarea");
        input?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [createSession, activeSessionId, abortSession, setActiveSession]);
}
