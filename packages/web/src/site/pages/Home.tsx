/**
 * Landing Page Component
 *
 * Animated landing with prompt bar CTA.
 * Users can enter a prompt or upload data to create a new workbook.
 */

import {
  ArrowRight,
  Envelope,
  Link,
  Table,
  UploadSimple,
} from "@phosphor-icons/react";
import { animate, motion, useMotionValue } from "motion/react";
import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

import { getStoredConfig, setStoredConfig } from "@hands/agent/browser";
import { createWorkbook } from "../../shared/lib/storage";

export function Home() {
  const [checking, setChecking] = useState(true);
  const [headlineVisible, setHeadlineVisible] = useState(false);
  const [promptBarVisible, setPromptBarVisible] = useState(false);
  const introProgress = useMotionValue(0);
  const [introProgressValue, setIntroProgressValue] = useState(0);

  // Skip auto-redirect - let users stay on landing page
  useEffect(() => {
    setChecking(false);
  }, []);

  // Staggered parallel animations (only start after workbook check)
  useEffect(() => {
    if (checking) return;

    // Headline appears immediately
    const headlineTimer = setTimeout(() => setHeadlineVisible(true), 100);

    // Hands animation starts shortly after
    const handsTimer = setTimeout(() => {
      animate(introProgress, 1, {
        duration: 2.4,
        ease: [0.25, 0.1, 0.25, 1],
        onUpdate: (v) => setIntroProgressValue(v),
      });
    }, 300);

    // Prompt bar appears partway through hands animation
    const promptTimer = setTimeout(() => setPromptBarVisible(true), 900);

    return () => {
      clearTimeout(headlineTimer);
      clearTimeout(handsTimer);
      clearTimeout(promptTimer);
    };
  }, [introProgress, checking]);

  const easing = [0.22, 1, 0.36, 1] as const;

  // Show nothing while checking for existing workbooks
  if (checking) {
    return (
      <div className="h-full bg-background flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full bg-background flex items-center justify-center px-6">
      <div className="max-w-2xl w-full">
        {/* Animated Headline */}
        <AnimatedHeroHeadline
          scrollProgress={introProgressValue}
          isVisible={headlineVisible}
        />

        {/* Prompt Bar CTA */}
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
    </div>
  );
}

// Editable prompt bar with API key capture
function PromptBar() {
  const [value, setValue] = useState("");
  const [showApiKeyPopover, setShowApiKeyPopover] = useState(false);
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [apiKeyValue, setApiKeyValue] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const apiKeyInputRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLButtonElement>(null);

  // Check for existing key on mount
  useEffect(() => {
    const config = getStoredConfig();
    setHasKey(!!config?.apiKey);
    if (config?.apiKey) setApiKeyValue(config.apiKey);
  }, []);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    if (showApiKeyPopover) {
      apiKeyInputRef.current?.focus();
    }
  }, [showApiKeyPopover]);

  // Close popover on outside click
  useEffect(() => {
    if (!showApiKeyPopover) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        !target.closest("[data-api-popover]") &&
        !target.closest("[data-logo-button]")
      ) {
        setShowApiKeyPopover(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showApiKeyPopover]);

  const navigateToEditor = async (prompt?: string) => {
    if (isNavigating) return;
    setIsNavigating(true);

    try {
      // Create a new workbook
      const workbook = await createWorkbook("New Workbook");

      if (prompt) {
        window.location.href = `/w/${workbook.id}?q=${encodeURIComponent(
          prompt
        )}`;
      } else {
        window.location.href = `/w/${workbook.id}`;
      }
    } catch (err) {
      console.error("Failed to create workbook:", err);
      setIsNavigating(false);
    }
  };

  const requireKeyThen = (action: string) => {
    if (!hasKey) {
      setPendingAction(action);
      setShowApiKeyPopover(true);
    } else {
      executePendingAction(action);
    }
  };

  const executePendingAction = (action: string) => {
    if (action === "submit") {
      navigateToEditor(value.trim());
    } else if (action === "upload") {
      navigateToEditor("upload");
    } else if (action.startsWith("link:")) {
      navigateToEditor(action.slice(5));
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    requireKeyThen("submit");
  };

  const handleSaveApiKey = (e: FormEvent) => {
    e.preventDefault();
    const key = apiKeyValue.trim();
    if (key) {
      setStoredConfig({ type: "openrouter", apiKey: key });
      setHasKey(true);
      setShowApiKeyPopover(false);
      if (pendingAction) {
        const action = pendingAction;
        setPendingAction(null);
        executePendingAction(action);
      }
    }
  };

  const handleSourceClick = (source: string) => {
    if (source === "upload") {
      requireKeyThen("upload");
    } else if (source === "link") {
      setValue("Connect to ");
      textareaRef.current?.focus();
    } else if (source === "email") {
      setShowComingSoon(true);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent);
    }
  };

  return (
    <>
      <div className="relative">
        <form onSubmit={handleSubmit}>
          <div className="flex items-center gap-3 bg-card rounded-2xl px-4 py-3 border border-border shadow-xl">
            {/* Clickable logo with yellow dot indicator */}
            <div className="relative shrink-0">
              <button
                ref={logoRef}
                type="button"
                data-logo-button
                onClick={() => setShowApiKeyPopover(!showApiKeyPopover)}
                className="flex items-center justify-center text-foreground hover:text-foreground/80 transition-colors"
              >
                <HandsLogo className="w-7 h-7" />
              </button>
              {/* Yellow dot if no API key */}
              {!hasKey && (
                <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-yellow-500 rounded-full border-2 border-card" />
              )}
            </div>

            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Where should hands get the data?"
              rows={1}
              className="flex-1 min-w-0 text-base bg-transparent text-foreground placeholder:text-muted-foreground/50 focus:outline-none resize-none leading-6"
              style={{ fieldSizing: "content" } as React.CSSProperties}
            />
            <button
              type="submit"
              disabled={isNavigating}
              className="h-9 w-9 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center transition-colors disabled:opacity-50"
            >
              {isNavigating ? (
                <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              ) : (
                <ArrowRight className="w-4 h-4" weight="bold" />
              )}
            </button>
          </div>
        </form>

        {/* API Key Popover - outside the form to avoid nesting */}
        {showApiKeyPopover && (
          <motion.div
            data-api-popover
            className="absolute top-full left-0 mt-2 w-72 bg-card border border-border rounded-xl p-4 shadow-xl z-50"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
          >
            <p className="text-sm font-medium text-foreground mb-2">
              OpenRouter API Key
            </p>
            <p className="text-xs text-muted-foreground mb-3">
              Your key stays in your browser.
            </p>

            <form onSubmit={handleSaveApiKey}>
              <input
                ref={apiKeyInputRef}
                type="password"
                value={apiKeyValue}
                onChange={(e) => setApiKeyValue(e.target.value)}
                placeholder="sk-or-v1-..."
                autoComplete="off"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg mb-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="submit"
                disabled={!apiKeyValue.trim()}
                className="w-full px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {hasKey ? "Update key" : "Save key"}
              </button>
            </form>

            <p className="text-xs text-muted-foreground mt-3 text-center">
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground hover:underline"
              >
                Get a key at openrouter.ai
              </a>
            </p>
          </motion.div>
        )}
      </div>

      {/* Data source pills */}
      <div className="flex gap-2 mt-4">
        <button
          type="button"
          onClick={() => handleSourceClick("upload")}
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
          onClick={() => handleSourceClick("email")}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full  text-secondary-foreground/80 text-sm transition-colors"
          disabled
        >
          <Envelope className="w-4 h-4" />
          Forward email
        </button>

        <button
          type="button"
          onClick={() => handleSourceClick("browser")}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-secondary-foreground/80 text-sm transition-colors"
          disabled
        >
          <Table className="w-4 h-4" />
          Browse Datasets
        </button>
      </div>

      {/* Coming Soon Modal */}
      {showComingSoon && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div
            className="bg-card border border-border rounded-xl p-6 max-w-sm w-full shadow-2xl text-center"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.15 }}
          >
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-secondary flex items-center justify-center">
              <Envelope className="w-6 h-6 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              Coming Soon
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              Email forwarding is on our roadmap. For now, try uploading a file
              or pasting a link.
            </p>
            <button
              type="button"
              onClick={() => setShowComingSoon(false)}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Got it
            </button>
          </motion.div>
        </div>
      )}
    </>
  );
}

// Animated Hero Headline - adapted from site
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
        {/* Line 1 */}
        <div className="relative inline-flex items-center">
          <motion.span
            initial={false}
            animate={{ x: phase === "crooked" ? -20 : 0 }}
            transition={{ duration: 0.8, ease: easing }}
          >
            The fastest way to
          </motion.span>
          {/* Pushing hand */}
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
        <br />
        {/* Line 2 */}
        <div className="relative inline-flex items-baseline justify-center">
          <motion.div
            className="absolute w-12 h-12 text-foreground pointer-events-none z-10"
            style={{
              right: "-2.5em",
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
          <motion.span
            className="text-muted-foreground origin-left inline-block"
            initial={false}
            animate={{
              rotate: phase === "crooked" || phase === "pushing" ? 1.5 : 0,
              y: phase === "crooked" || phase === "pushing" ? 3 : 0,
            }}
            transition={{ duration: 0.8, ease: easing }}
          >
            explore & share data
          </motion.span>
        </div>
      </h1>
    </motion.div>
  );
}

// Icons
function HandsLogo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />
      <path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2" />
      <path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </svg>
  );
}

function PushHandIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M18 11h-5a2 2 0 0 0 0 4h1" />
      <path d="M18 15V9a2 2 0 0 0-2-2 2 2 0 0 0-2 2" />
      <path d="M14 10V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v2" />
      <path d="M10 10V8a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8a6 6 0 0 0 6 6h2a6 6 0 0 0 6-6v-2" />
    </svg>
  );
}

function OkHandIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 25 25"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      className={className}
    >
      <path d="M15.9957 11.5C14.8197 10.912 11.9957 9 10.4957 9C8.9957 9 5.17825 11.7674 6 13C7 14.5 9.15134 11.7256 10.4957 12C11.8401 12.2744 13 13.5 13 14.5C13 15.5 11.8401 16.939 10.4957 16.5C9.15134 16.061 8.58665 14.3415 7.4957 14C6.21272 13.5984 5.05843 14.6168 5.5 15.5C5.94157 16.3832 7.10688 17.6006 8.4957 19C9.74229 20.2561 11.9957 21.5 14.9957 20C17.9957 18.5 18.5 16.2498 18.5 13C18.5 11.5 13.7332 5.36875 11.9957 4.5C10.9957 4 10 5 10.9957 6.5C11.614 7.43149 13.5 9.27705 14 10.3751M15.5 8C15.5 8 15.3707 7.5 14.9957 6C14.4957 4 15.9957 3.5 16.4957 4.5C17.1281 5.76491 18.2872 10.9147 18.4957 13" />
    </svg>
  );
}
