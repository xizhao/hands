/**
 * Landing Page Content
 *
 * Lightweight landing page with animated hero and prompt bar.
 * No editor dependencies - loads instantly.
 * Shell is rendered by root layout in App.tsx.
 */

import { ChatInput, type ChatInputRef } from "@hands/app";
import { Envelope, Link, Table, UploadSimple } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { animate, motion, useMotionValue } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { createWorkbook } from "../shared/lib/storage";
import { HandsLogo, OkHandIcon, PushHandIcon } from "../components/icons";

// Content only - shell is rendered by App.tsx root layout
export function LandingContent() {
  const [headlineVisible, setHeadlineVisible] = useState(false);
  const [promptBarVisible, setPromptBarVisible] = useState(false);
  const introProgress = useMotionValue(0);
  const [introProgressValue, setIntroProgressValue] = useState(0);

  // Staggered parallel animations
  useEffect(() => {
    const headlineTimer = setTimeout(() => setHeadlineVisible(true), 100);
    const handsTimer = setTimeout(() => {
      animate(introProgress, 1, {
        duration: 2.4,
        ease: [0.25, 0.1, 0.25, 1],
        onUpdate: (v) => setIntroProgressValue(v),
      });
    }, 300);
    const promptTimer = setTimeout(() => setPromptBarVisible(true), 900);

    return () => {
      clearTimeout(headlineTimer);
      clearTimeout(handsTimer);
      clearTimeout(promptTimer);
    };
  }, [introProgress]);

  const easing = [0.22, 1, 0.36, 1] as const;

  return (
    <div className="max-w-2xl w-full">
      <AnimatedHeroHeadline
        scrollProgress={introProgressValue}
        isVisible={headlineVisible}
      />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{
          opacity: promptBarVisible ? 1 : 0,
          y: promptBarVisible ? 0 : 20,
        }}
        transition={{ duration: 0.35, ease: easing }}
      >
        <PromptBar />
      </motion.div>
    </div>
  );
}

// Keep old export for backwards compat
export { LandingContent as LandingPage };

// Prompt bar - uses shared ChatInput, API key in global settings
function PromptBar() {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [isNavigating, setIsNavigating] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<string[]>([]);
  const chatInputRef = useRef<ChatInputRef>(null);

  // Focus after prompt bar animation completes
  useEffect(() => {
    const timer = setTimeout(() => {
      chatInputRef.current?.focus();
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  const handleSend = async () => {
    if (isNavigating) return;
    setIsNavigating(true);

    try {
      // Build prompt with file references
      let prompt = value.trim();
      if (pendingFiles.length > 0) {
        const fileRefs = pendingFiles.map((f) => `@import ${f}`).join("\n");
        prompt = prompt ? `${prompt}\n\n${fileRefs}` : fileRefs;
      }

      const workbook = await createWorkbook("New Workbook");
      navigate({
        to: "/w/$workbookId",
        params: { workbookId: workbook.id },
        search: prompt ? { q: prompt } : undefined,
      });
    } catch (err) {
      console.error("Failed to create workbook:", err);
      setIsNavigating(false);
    }
  };

  const handleSourceClick = (source: string) => {
    if (source === "link") {
      setValue("Connect to ");
      chatInputRef.current?.focus();
    }
  };

  return (
    <>
      {/* Hero prompt bar container */}
      <div className="flex items-center gap-3 bg-card rounded-2xl pl-4 pr-2 py-2 border border-border shadow-xl">
        <HandsLogo className="w-7 h-7 shrink-0 text-foreground" />

        <ChatInput
          ref={chatInputRef}
          value={value}
          onChange={setValue}
          onSend={handleSend}
          isSending={isNavigating}
          pendingFiles={pendingFiles}
          onPendingFilesChange={setPendingFiles}
          placeholder="Where should hands get the data?"
          className="flex-1"
        />
      </div>

      {/* Data source pills */}
      <div className="flex gap-2 mt-4">
        <button
          type="button"
          onClick={handleSend}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm transition-colors"
        >
          <UploadSimple className="w-4 h-4" />
          Upload file
        </button>
        <button
          type="button"
          onClick={() => handleSourceClick("link")}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm transition-colors"
        >
          <Link className="w-4 h-4" />
          Paste link
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-secondary-foreground/50 text-sm cursor-not-allowed"
          disabled
        >
          <Envelope className="w-4 h-4" />
          Forward email
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-secondary-foreground/50 text-sm cursor-not-allowed"
          disabled
        >
          <Table className="w-4 h-4" />
          Browse Datasets
        </button>
      </div>
    </>
  );
}

// Animated Hero Headline
function AnimatedHeroHeadline({
  scrollProgress = 0,
  isVisible = false,
}: {
  scrollProgress?: number;
  isVisible?: boolean;
}) {
  const phase: "crooked" | "pushing" | "dragging" | "done" =
    scrollProgress < 0.1
      ? "crooked"
      : scrollProgress < 0.5
        ? "pushing"
        : scrollProgress < 0.9
          ? "dragging"
          : "done";

  const easing = [0.22, 1, 0.36, 1] as const;

  return (
    <motion.div
      className="mb-8"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: isVisible ? 1 : 0, y: isVisible ? 0 : 20 }}
      transition={{ duration: 0.4, ease: easing }}
    >
      <h1
        className="site-header font-bold tracking-tight text-foreground leading-[1.1]"
        style={{ fontSize: "clamp(2.5rem, 6vw, 4rem)" }}
      >
        <div className="relative inline-flex items-center">
          <motion.span
            initial={false}
            animate={{ x: phase === "crooked" ? -20 : 0 }}
            transition={{ duration: 0.8, ease: easing }}
          >
            Instantly explore data
          </motion.span>
          <motion.div
            className="absolute -left-11 top-1/2 w-8 h-8 text-foreground pointer-events-none"
            initial={false}
            animate={{
              opacity: phase === "pushing" ? 1 : 0,
              x: phase === "pushing" ? 20 : 0,
              y: "-50%",
            }}
            transition={{ duration: 0.6, ease: easing }}
          >
            <PushHandIcon className="w-full h-full" />
          </motion.div>
        </div>
        <div className="relative inline-flex items-baseline justify-center">
          <motion.div
            className="absolute w-12 h-12 text-foreground pointer-events-none z-10"
            style={{
              right: "0em",
              top: "0.1em",
              transformOrigin: "40% 36%",
            }}
            initial={false}
            animate={{
              opacity: phase === "dragging" ? 1 : 0,
              rotate: -130,
              y:
                phase === "crooked" || phase === "pushing"
                  ? 20
                  : phase === "dragging"
                    ? 0
                    : -10,
            }}
            transition={{ duration: 0.5, ease: easing }}
          >
            <OkHandIcon className="w-full h-full" />
          </motion.div>
        </div>
      </h1>
    </motion.div>
  );
}

