import { useEffect, useRef, useState } from "react";
import { Demo } from "../components/Demo";
import { useTheme } from "../hooks/useTheme";
import { SiteEditorProvider } from "../providers/SiteEditorProvider";

export default function IndexPage() {
  const { theme, toggleTheme } = useTheme();

  return (
    <SiteEditorProvider>
      <div className="min-h-screen bg-background overflow-x-hidden">
        {/* Floating Toolbar */}
        <nav className="fixed top-4 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-1 px-2 py-1.5 bg-zinc-950 dark:bg-zinc-900 rounded-xl shadow-lg shadow-black/25 border border-zinc-800 dark:border-zinc-700 backdrop-blur-xl">
            <div className="flex items-center gap-2 px-3 py-1.5 text-white">
              <HandsLogo className="w-4 h-4" />
              <span className="text-sm font-medium">Hands</span>
            </div>
            <div className="w-px h-4 bg-zinc-700" />
            <a
              href="https://github.com/hands"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 text-sm text-zinc-400 hover:text-white transition-all duration-200"
            >
              GitHub
            </a>
            <button
              onClick={toggleTheme}
              className="p-2 rounded-full hover:bg-zinc-700 transition-all duration-200 text-zinc-400 hover:text-white"
              aria-label="Toggle theme"
            >
              {theme === "system" ? (
                <MonitorIcon className="w-4 h-4" />
              ) : theme === "dark" ? (
                <MoonIcon className="w-4 h-4" />
              ) : (
                <SunIcon className="w-4 h-4" />
              )}
            </button>
          </div>
        </nav>

        {/* Hero Section - Split Layout */}
        <section className="min-h-screen flex items-center">
          <div className="w-full max-w-[1800px] mx-auto flex items-center">
            {/* Left side - Hero text */}
            <div className="w-full lg:w-[45%] xl:w-[40%] px-8 lg:px-16 py-32 shrink-0">
              <AnimatedHeroHeadline />
              <FadeIn delay={100}>
                <p className="text-xl text-muted-foreground max-w-md mb-8">
                  An extraordinarily powerful document editor to run your
                  business in.
                </p>
              </FadeIn>
              <FadeIn delay={200}>
                <div className="flex items-center gap-4">
                  <button className="group px-6 py-3 bg-foreground text-background rounded-lg font-medium transition-all duration-200 hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]">
                    Download for Mac
                  </button>
                  <button className="px-6 py-3 border border-border rounded-lg font-medium transition-all duration-200 hover:bg-muted hover:border-muted-foreground/20 active:scale-[0.98]">
                    View Demo
                  </button>
                </div>
              </FadeIn>
            </div>

            {/* Right side - Demo extending off screen */}
            <div className="hidden lg:block flex-1 min-w-0 self-start pt-28 relative">
              {/* Chat bar appears first and types */}
              <FadeIn
                delay={300}
                className="absolute -bottom-4 left-0 w-[500px] z-10"
              >
                <HeroChatBar />
              </FadeIn>
              {/* Demo fades in after chat bar finishes typing (~2s) */}
              <FadeIn delay={2200} className="w-[700px] xl:w-[850px]">
                <Demo />
              </FadeIn>
            </div>
          </div>
        </section>

        {/* How to Use Hands Section */}
        <section className="py-32 px-8">
          <div className="max-w-6xl mx-auto">
            {/* Step 1: Point at Data */}
            <div className="grid lg:grid-cols-2 gap-16 items-start mb-32">
              <FadeInOnScroll>
                <div className="sticky top-32">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-muted rounded-full text-sm text-muted-foreground mb-4">
                    <span className="w-5 h-5 rounded-full bg-foreground text-background flex items-center justify-center text-xs font-bold">
                      1
                    </span>
                    Connect
                  </div>
                  <h3 className="site-header text-3xl font-bold text-foreground mb-4">
                    Point Hands towards any data
                  </h3>
                  <p className="text-lg text-muted-foreground mb-6">
                    Hands will figure out how to set up live syncs to any
                    business process — whether you know how to, or not. Press{" "}
                    <kbd className="px-2 py-1 bg-muted border border-border rounded text-sm font-mono shadow-sm">
                      ⌘⇧H
                    </kbd>{" "}
                    to capture anything on screen.
                  </p>
                  <ul className="space-y-3 text-muted-foreground">
                    <FeatureItem>
                      Works with databases, APIs, spreadsheets, files
                    </FeatureItem>
                    <FeatureItem>
                      Figures out auth, parsing, and sync logic
                    </FeatureItem>
                    <FeatureItem>
                      Builds the integration automatically
                    </FeatureItem>
                  </ul>
                </div>
              </FadeInOnScroll>
              <FadeInOnScroll delay={100}>
                <AgentCaptureDemo />
              </FadeInOnScroll>
            </div>

            {/* Step 2: Analyze and Iterate */}
            <div className="grid lg:grid-cols-2 gap-16 items-center mb-32">
              <FadeInOnScroll className="order-2 lg:order-1" delay={100}>
                <AIAnalysisDemo />
              </FadeInOnScroll>
              <FadeInOnScroll className="order-1 lg:order-2">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-muted rounded-full text-sm text-muted-foreground mb-4">
                    <span className="w-5 h-5 rounded-full bg-foreground text-background flex items-center justify-center text-xs font-bold">
                      2
                    </span>
                    Analyze
                  </div>
                  <h3 className="site-header text-3xl font-bold text-foreground mb-4">
                    Analyze and iterate
                  </h3>
                  <p className="text-lg text-muted-foreground mb-6">
                    Describe what you want to see. Hands' AI agent writes the
                    queries, builds the charts, and refines until it's right.
                    Just keep describing — it keeps improving.
                  </p>
                  <ul className="space-y-3 text-muted-foreground">
                    <FeatureItem>
                      Natural language to SQL and charts
                    </FeatureItem>
                    <FeatureItem>
                      Iterative refinement through conversation
                    </FeatureItem>
                    <FeatureItem>
                      AI that understands your business context
                    </FeatureItem>
                  </ul>
                </div>
              </FadeInOnScroll>
            </div>

            {/* Step 3: Share Living Apps */}
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <FadeInOnScroll>
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-muted rounded-full text-sm text-muted-foreground mb-4">
                    <span className="w-5 h-5 rounded-full bg-foreground text-background flex items-center justify-center text-xs font-bold">
                      3
                    </span>
                    Share
                  </div>
                  <h3 className="site-header text-3xl font-bold text-foreground mb-4">
                    Run your business by writing
                  </h3>
                  <p className="text-lg text-muted-foreground mb-6">
                    Share living apps and automations. Replaces docs and
                    spreadsheets. Your workbooks stay live — data updates
                    automatically, charts refresh, automations run on schedule.
                    Share a link, not a static file.
                  </p>
                  <ul className="space-y-3 text-muted-foreground">
                    <FeatureItem>
                      Live dashboards that update automatically
                    </FeatureItem>
                    <FeatureItem>
                      Scheduled actions, alerts, and workflows
                    </FeatureItem>
                    <FeatureItem>
                      Share links instead of attachments
                    </FeatureItem>
                  </ul>
                </div>
              </FadeInOnScroll>
              <FadeInOnScroll delay={100}>
                <DashboardDemo />
              </FadeInOnScroll>
            </div>
          </div>
        </section>

        {/* Social Proof Section */}
        <section className="py-32 px-8 bg-muted/30">
          <div className="max-w-4xl mx-auto">
            <FadeInOnScroll>
              <div className="text-center mb-16">
                <h2 className="site-header text-3xl font-bold text-foreground mb-4">
                  Teams are switching from spreadsheets
                </h2>
              </div>
            </FadeInOnScroll>

            <FadeInOnScroll delay={100}>
              <div className="bg-card rounded-2xl border border-border p-8 md:p-12 shadow-lg">
                <div className="flex items-start gap-6">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white font-bold text-xl shrink-0">
                    S
                  </div>
                  <div>
                    <blockquote className="text-xl md:text-2xl text-foreground mb-6 leading-relaxed">
                      "We used to email spreadsheets back and forth for weekly
                      reports. Now we just share a Hands workbook — it's always
                      up to date, and the team can drill into the data
                      themselves."
                    </blockquote>
                    <div className="flex items-center gap-4">
                      <div>
                        <div className="font-semibold text-foreground">
                          Sarah Chen
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Head of Operations, TechStartup
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </FadeInOnScroll>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-32 px-8">
          <FadeInOnScroll>
            <div className="max-w-2xl mx-auto text-center">
              <h2 className="site-header text-4xl md:text-5xl font-bold text-foreground mb-6">
                Never send a doc again.
              </h2>
              <p className="text-xl text-muted-foreground mb-10">
                Send a Hands Workbook.
              </p>
              <button className="px-8 py-4 bg-foreground text-background rounded-lg font-medium text-lg transition-all duration-200 hover:scale-[1.02] hover:shadow-xl active:scale-[0.98]">
                Download for Mac
              </button>
            </div>
          </FadeInOnScroll>
        </section>
      </div>
    </SiteEditorProvider>
  );
}

// Animated Hero Headline - hands push crooked text into place
function AnimatedHeroHeadline() {
  const [phase, setPhase] = useState<
    "crooked" | "pushing" | "dragging" | "done"
  >("crooked");

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase("pushing"), 400),
      setTimeout(() => setPhase("dragging"), 1200),
      setTimeout(() => setPhase("done"), 2000),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="mb-6">
      {/* Fixed size text that never wraps */}
      <h1
        className="site-header font-bold tracking-tight text-foreground leading-[1.1] whitespace-nowrap"
        style={{ fontSize: "clamp(2.75rem, 4.5vw, 4.5rem)" }}
      >
        {/* Line 1: "An extra set of" - starts shifted left, pushed into place */}
        <div className="relative inline-flex items-center">
          <span
            className="transition-transform duration-700 ease-out"
            style={{
              transform:
                phase === "crooked" ? "translateX(-20px)" : "translateX(0)",
            }}
          >
            An extra set of
          </span>
          {/* Pushing hand - comes from left, pushes text right */}
          <PushHandIcon
            className="absolute -left-11 top-1/2 w-8 h-8 text-foreground transition-all duration-700 ease-out"
            style={{
              opacity: phase === "pushing" ? 1 : 0,
              transform: `translateY(-50%) translateX(${
                phase === "pushing" ? "20px" : "0px"
              })`,
            }}
          />
        </div>
        <br />
        {/* Line 2: "hands at work." - starts rotated/shifted, OK hand drags period to straighten */}
        <div className="relative inline-flex items-baseline">
          <span
            className="text-muted-foreground transition-transform duration-700 ease-out origin-left inline-block"
            style={{
              transform:
                phase === "crooked" || phase === "pushing"
                  ? "rotate(1.5deg) translateY(3px)"
                  : "rotate(0deg) translateY(0px)",
            }}
          >
            hands at work
          </span>
          {/* Period with OK hand pinching it */}
          <span
            className="relative inline-block text-muted-foreground transition-transform duration-700 ease-out"
            style={{
              transform:
                phase === "crooked" || phase === "pushing"
                  ? "translateX(8px) translateY(6px)"
                  : "translateX(0) translateY(0)",
            }}
          >
            .{/* OK hand - pinch point positioned exactly on period center */}
            {/* Pinch point in SVG is at ~40% x, ~36% y (coords 10,9 in 25x25 viewBox) */}
            <OkHandIcon
              className="absolute w-12 h-12 text-foreground transition-all duration-700 ease-out pointer-events-none"
              style={{
                // Position so pinch point (40% from left, 36% from top of icon) lands on period
                // Icon is 3rem (48px). Pinch at 40%=19.2px from left, 36%=17.3px from top
                // Period center is roughly at 0.15em from left of ".", 0.5em above baseline
                // Offset: left = -19.2px + period_center, top = -17.3px + period_center
                top: "calc(-0.9em)",
                left: "calc(-0.65em)",
                opacity: phase === "dragging" ? 1 : phase === "done" ? 0.5 : 0,
                // Rotate around the pinch point so it stays on the period
                transformOrigin: "40% 36%",
                transform:
                  phase === "dragging"
                    ? "rotate(-130deg)"
                    : phase === "done"
                    ? "rotate(-130deg) scale(0.95)"
                    : "rotate(-130deg) translate(6px, 6px)",
              }}
            />
          </span>
        </div>
      </h1>
    </div>
  );
}

// Pushing hand icon - points right to push things
function PushHandIcon({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
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
      style={style}
    >
      {/* Pointing hand facing right */}
      <path d="M18 11h-5a2 2 0 0 0 0 4h1" />
      <path d="M18 15V9a2 2 0 0 0-2-2 2 2 0 0 0-2 2" />
      <path d="M14 10V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v2" />
      <path d="M10 10V8a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8a6 6 0 0 0 6 6h2a6 6 0 0 0 6-6v-2" />
    </svg>
  );
}

// OK hand icon - for dragging/pinching (from svgrepo)
function OkHandIcon({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 25 25"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      className={className}
      style={style}
    >
      <path d="M15.9957 11.5C14.8197 10.912 11.9957 9 10.4957 9C8.9957 9 5.17825 11.7674 6 13C7 14.5 9.15134 11.7256 10.4957 12C11.8401 12.2744 13 13.5 13 14.5C13 15.5 11.8401 16.939 10.4957 16.5C9.15134 16.061 8.58665 14.3415 7.4957 14C6.21272 13.5984 5.05843 14.6168 5.5 15.5C5.94157 16.3832 7.10688 17.6006 8.4957 19C9.74229 20.2561 11.9957 21.5 14.9957 20C17.9957 18.5 18.5 16.2498 18.5 13C18.5 11.5 13.7332 5.36875 11.9957 4.5C10.9957 4 10 5 10.9957 6.5C11.614 7.43149 13.5 9.27705 14 10.3751M15.5 8C15.5 8 15.3707 7.5 14.9957 6C14.4957 4 15.9957 3.5 16.4957 4.5C17.1281 5.76491 18.2872 10.9147 18.4957 13" />
    </svg>
  );
}

// Fade in animation component
function FadeIn({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div
      className={`transition-all duration-700 ease-out ${className} ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      }`}
    >
      {children}
    </div>
  );
}

// Fade in on scroll component
function FadeInOnScroll({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => setIsVisible(true), delay);
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [delay]);

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${className} ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      }`}
    >
      {children}
    </div>
  );
}

// Feature item with animated check
function FeatureItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 group">
      <div className="w-5 h-5 rounded-full bg-green-500/10 flex items-center justify-center transition-all duration-200 group-hover:bg-green-500/20 group-hover:scale-110">
        <CheckIcon className="w-3 h-3 text-green-500" />
      </div>
      <span className="transition-colors duration-200 group-hover:text-foreground">
        {children}
      </span>
    </li>
  );
}

// Hero Chat Bar Component - positioned relative to demo
function HeroChatBar() {
  const [displayText, setDisplayText] = useState("");
  const [phase, setPhase] = useState<"typing" | "waiting" | "deleting">(
    "typing"
  );
  const fullText = "Show me revenue trends by month";

  useEffect(() => {
    let index = 0;
    let timeout: NodeJS.Timeout;

    const animate = () => {
      if (phase === "typing") {
        if (index < fullText.length) {
          index++;
          setDisplayText(fullText.slice(0, index));
          timeout = setTimeout(animate, 40 + Math.random() * 30);
        } else {
          setPhase("waiting");
          timeout = setTimeout(() => setPhase("deleting"), 2500);
        }
      } else if (phase === "deleting") {
        if (index > 0) {
          index--;
          setDisplayText(fullText.slice(0, index));
          timeout = setTimeout(animate, 20);
        } else {
          setPhase("typing");
          timeout = setTimeout(animate, 800);
        }
      }
    };

    animate();
    return () => clearTimeout(timeout);
  }, [phase]);

  return (
    <div className="flex items-center gap-3 bg-background rounded-2xl px-5 py-4 border border-border/40 shadow-xl">
      <button className="h-10 w-10 shrink-0 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
        <SettingsIcon className="w-5 h-5" />
      </button>
      <div className="flex-1 min-w-0 py-1 text-lg">
        {displayText ? (
          <span className="text-foreground">{displayText}</span>
        ) : (
          <span className="text-muted-foreground/50">
            Describe what you need...
          </span>
        )}
        <span className="inline-block w-0.5 h-5 bg-foreground animate-pulse ml-1 rounded-full" />
      </div>
      <button className="h-10 w-10 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center transition-colors">
        <ArrowUpIcon className="w-5 h-5" />
      </button>
    </div>
  );
}

// Agent reasoning step type
interface ReasoningStep {
  type: "thought" | "tool" | "success";
  text?: string;
  name?: string;
  args?: string;
  status?: "running" | "done";
  result?: string;
}

// Agent Capture Demo - Shows complex data capture with agent reasoning
// Uses capture-action panel styles: pulsing glow, pill buttons, etc.
function AgentCaptureDemo() {
  const [phase, setPhase] = useState<"email" | "capturing" | "reasoning">(
    "email"
  );
  const [reasoningStep, setReasoningStep] = useState(0);

  const reasoningSteps: ReasoningStep[] = [
    {
      type: "thought",
      text: "This appears to be a Parquet file on S3. I'll need to authenticate and parse the columnar format.",
    },
    {
      type: "tool",
      name: "read_file",
      args: "inventory_q4.parquet",
      status: "done",
      result: "Binary, 2.3MB, Apache Parquet",
    },
    {
      type: "thought",
      text: "Parquet confirmed. Checking for AWS credentials in the email context...",
    },
    {
      type: "tool",
      name: "extract_credentials",
      args: "screenshot_context",
      status: "done",
      result: "Found S3 bucket + IAM role ARN",
    },
    {
      type: "tool",
      name: "aws_assume_role",
      args: "arn:aws:iam::847291...",
      status: "done",
      result: "Session token acquired",
    },
    {
      type: "tool",
      name: "s3_get_object",
      args: "s3://ops-data-lake/exports/...",
      status: "done",
      result: "Downloaded 2.3MB",
    },
    {
      type: "tool",
      name: "parse_parquet",
      args: "inventory_q4.parquet",
      status: "done",
      result: "12 columns, 48,291 rows",
    },
    {
      type: "thought",
      text: "Schema: sku, warehouse_id, quantity, last_updated, cost_basis... Creating table.",
    },
    {
      type: "tool",
      name: "create_table",
      args: "inventory_data",
      status: "done",
      result: "Table created",
    },
    {
      type: "tool",
      name: "insert_rows",
      args: "48,291 rows",
      status: "done",
      result: "Import complete",
    },
    {
      type: "success",
      text: "Live sync established. Table refreshes every 15 minutes.",
    },
  ];

  useEffect(() => {
    const timer1 = setTimeout(() => setPhase("capturing"), 2000);
    const timer2 = setTimeout(() => setPhase("reasoning"), 3500);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, []);

  useEffect(() => {
    if (phase !== "reasoning") return;
    if (reasoningStep >= reasoningSteps.length) return;

    const delay = reasoningSteps[reasoningStep].type === "thought" ? 1200 : 600;
    const timer = setTimeout(() => setReasoningStep((s) => s + 1), delay);
    return () => clearTimeout(timer);
  }, [phase, reasoningStep, reasoningSteps.length]);

  return (
    <div className="space-y-3">
      {/* Screenshot with pulsing glow - capture-action style */}
      <div className="relative p-4">
        {/* Glow layer - pulsing gradient blur */}
        <div className="absolute inset-3 rounded-xl bg-gradient-to-r from-blue-500/50 via-purple-500/50 to-blue-500/50 blur-md animate-glow-pulse" />

        {/* Email card on top */}
        <div className="relative rounded-xl border border-border bg-card overflow-hidden shadow-xl">
          {/* Capture overlay */}
          <div
            className={`absolute inset-0 z-20 pointer-events-none transition-all duration-300 ${
              phase === "capturing" ? "opacity-100" : "opacity-0"
            }`}
          >
            <div className="absolute inset-0 border-4 border-violet-500 rounded-xl" />
            <div className="absolute inset-0 border-4 border-violet-500 rounded-xl animate-ping opacity-50" />
            <div className="absolute top-4 right-4 bg-violet-500 text-white px-3 py-1.5 rounded-full text-sm font-medium flex items-center gap-2 shadow-lg shadow-violet-500/30">
              <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
              Capturing
            </div>
            {/* Mac cursor */}
            <div className="absolute bottom-8 right-12">
              <MacCursor />
            </div>
          </div>

          {/* Window chrome */}
          <div className="h-10 bg-muted/50 border-b border-border flex items-center px-3 gap-2">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <div className="w-3 h-3 rounded-full bg-green-500/80" />
            </div>
            <div className="flex items-center gap-2 ml-2">
              <MailIcon className="w-4 h-4 text-red-500" />
              <span className="text-xs text-muted-foreground">Gmail</span>
            </div>
          </div>

          {/* Email content */}
          <div className="p-4 bg-background">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-white text-sm font-medium">
                M
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground text-sm">
                    Marcus (Data Eng)
                  </span>
                  <span className="text-xs text-muted-foreground">2:34 PM</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Q4 inventory export
                </div>
              </div>
            </div>

            <div className="text-sm text-foreground space-y-3">
              <p className="text-muted-foreground">
                Here's that data — it's in our data lake:
              </p>

              {/* File attachment */}
              <div className="flex items-center gap-3 p-2.5 bg-muted rounded-lg border border-border/50">
                <div className="w-9 h-9 rounded bg-emerald-500/10 flex items-center justify-center">
                  <FileIcon className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">
                    inventory_q4.parquet
                  </div>
                  <div className="text-xs text-muted-foreground">
                    2.3 MB • Apache Parquet
                  </div>
                </div>
              </div>

              <div className="bg-muted/50 rounded p-2.5 font-mono text-[11px] space-y-1 border border-border/30">
                <div>
                  <span className="text-muted-foreground">Location:</span>{" "}
                  <span className="text-foreground">
                    s3://ops-data-lake/exports/inventory_q4.parquet
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Access:</span>{" "}
                  <span className="text-foreground">
                    arn:aws:iam::847291038471:role/DataAnalystRole
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Workbook selector pill - capture-action style */}
      <div className="px-4">
        <button className="inline-flex items-center gap-1 px-3 py-1.5 bg-secondary/50 hover:bg-accent text-xs rounded-full border border-border/50 transition-colors">
          <FolderIcon className="w-3 h-3" />
          <span>Inventory Dashboard</span>
          <ChevronDownIcon className="w-3 h-3 text-muted-foreground" />
        </button>
      </div>

      {/* Agent message bubble - capture-action style */}
      <div className="px-4">
        <div className="inline-flex items-start gap-2 px-3 py-2 bg-card rounded-lg border border-border/50 max-w-full">
          <HandsLogo className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          {phase !== "reasoning" ? (
            <span className="text-sm text-muted-foreground italic animate-text-shimmer">
              Thinking...
            </span>
          ) : (
            <span className="text-sm text-foreground">
              Parquet file on S3 with IAM role access. Setting up live sync...
            </span>
          )}
        </div>
      </div>

      {/* Agent reasoning thread - shows tool calls */}
      {phase === "reasoning" && (
        <div className="px-4">
          <div className="rounded-lg border border-border bg-card/50 overflow-hidden">
            <div className="p-2.5 space-y-1.5 max-h-[200px] overflow-y-auto text-xs font-mono">
              {reasoningSteps.slice(0, reasoningStep).map((step, i) => (
                <div
                  key={i}
                  className="animate-in fade-in slide-in-from-bottom-1 duration-200"
                >
                  {step.type === "thought" && (
                    <div className="flex gap-2 text-muted-foreground">
                      <span className="shrink-0 opacity-50">→</span>
                      <span className="italic">{step.text}</span>
                    </div>
                  )}
                  {step.type === "tool" && (
                    <div className="flex items-center gap-1.5">
                      <span className="px-1 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-600">
                        done
                      </span>
                      <span className="text-violet-500">{step.name}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="text-foreground/70 truncate">
                        {step.result}
                      </span>
                    </div>
                  )}
                  {step.type === "success" && (
                    <div className="flex items-center gap-2 mt-1.5 p-2 bg-emerald-500/10 rounded border border-emerald-500/20">
                      <CheckIcon className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-emerald-700 dark:text-emerald-400 font-medium text-xs">
                        {step.text}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Action pills - capture-action style */}
      {phase === "reasoning" && reasoningStep >= reasoningSteps.length && (
        <div className="px-4 flex flex-wrap items-center gap-2">
          {[
            { icon: DatabaseIcon, label: "Import to table" },
            { icon: ChartIcon, label: "Create dashboard" },
          ].map((action, i) => (
            <button
              key={i}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-secondary/50 hover:bg-accent text-xs rounded-full border border-border/50 transition-all animate-in fade-in slide-in-from-bottom-2"
              style={{
                animationDelay: `${i * 80}ms`,
                animationFillMode: "both",
              }}
            >
              <action.icon className="w-3 h-3" />
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Keyboard shortcut hint */}
      <div className="flex items-center justify-center gap-2 text-muted-foreground text-xs pt-2">
        <kbd className="px-1.5 py-0.5 bg-muted border border-border rounded text-[10px] font-mono shadow-sm">
          ⌘
        </kbd>
        <kbd className="px-1.5 py-0.5 bg-muted border border-border rounded text-[10px] font-mono shadow-sm">
          ⇧
        </kbd>
        <kbd className="px-1.5 py-0.5 bg-muted border border-border rounded text-[10px] font-mono shadow-sm">
          H
        </kbd>
        <span>to capture</span>
      </div>
    </div>
  );
}

// Mac cursor SVG
function MacCursor() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="drop-shadow-lg"
    >
      <path
        d="M5.5 3L5.5 21L10.5 16L14.5 21L17 19.5L13 14.5L19.5 14.5L5.5 3Z"
        fill="white"
        stroke="black"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// File icon
function FileIcon({ className }: { className?: string }) {
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
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </svg>
  );
}

// AI Analysis Demo - matches capture-action window style
function AIAnalysisDemo() {
  const [phase, setPhase] = useState<"thinking" | "summary" | "actions">(
    "thinking"
  );

  useEffect(() => {
    const timer1 = setTimeout(() => setPhase("summary"), 1500);
    const timer2 = setTimeout(() => setPhase("actions"), 2500);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, []);

  return (
    <div className="relative">
      {/* Screenshot with pulsing glow - like capture-action */}
      <div className="relative">
        {/* Glow layer */}
        <div className="absolute -inset-1 rounded-xl bg-gradient-to-r from-blue-500/50 via-purple-500/50 to-blue-500/50 blur-md animate-glow-pulse" />

        {/* Fake spreadsheet screenshot */}
        <div className="relative rounded-lg overflow-hidden shadow-xl border border-border bg-card">
          {/* Spreadsheet header */}
          <div className="h-8 bg-muted/50 border-b border-border flex items-center px-3 gap-2">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <div className="w-3 h-3 rounded-full bg-green-500/80" />
            </div>
            <span className="text-xs text-muted-foreground ml-2">
              Q4_Sales_Data.csv
            </span>
          </div>

          {/* Spreadsheet grid */}
          <div className="p-0 text-xs font-mono">
            <div className="grid grid-cols-4 border-b border-border bg-muted/30">
              <div className="px-3 py-1.5 border-r border-border font-medium text-muted-foreground">
                Month
              </div>
              <div className="px-3 py-1.5 border-r border-border font-medium text-muted-foreground">
                Revenue
              </div>
              <div className="px-3 py-1.5 border-r border-border font-medium text-muted-foreground">
                Orders
              </div>
              <div className="px-3 py-1.5 font-medium text-muted-foreground">
                Customers
              </div>
            </div>
            {[
              ["Oct 2024", "$84,230", "423", "312"],
              ["Nov 2024", "$96,450", "487", "358"],
              ["Dec 2024", "$103,820", "512", "401"],
            ].map((row, i) => (
              <div
                key={i}
                className="grid grid-cols-4 border-b border-border/50 last:border-0"
              >
                {row.map((cell, j) => (
                  <div
                    key={j}
                    className="px-3 py-1.5 border-r border-border/50 last:border-0 text-foreground"
                  >
                    {cell}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Workbook selector - like capture-action */}
      <div className="mt-4">
        <button className="inline-flex items-center gap-1 px-3 py-1.5 bg-secondary/50 hover:bg-accent text-xs rounded-full border border-border/50 transition-colors">
          <FolderIcon className="w-3 h-3" />
          <span>Sales Dashboard</span>
          <ChevronDownIcon className="w-3 h-3 text-muted-foreground" />
        </button>
      </div>

      {/* Agent thinking/summary bubble */}
      <div className="mt-3">
        <div className="inline-flex items-start gap-2 px-3 py-2 bg-card rounded-lg border border-border/50">
          <HandsLogo className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          {phase === "thinking" ? (
            <span className="text-sm text-muted-foreground italic animate-text-shimmer">
              Thinking...
            </span>
          ) : (
            <p className="text-sm text-foreground">
              Q4 sales data with monthly revenue, orders, and customer counts. I
              can create a dashboard or import this.
            </p>
          )}
        </div>
      </div>

      {/* AI-suggested action pills - staggered animation like capture-action */}
      {phase === "actions" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {[
            { icon: DatabaseIcon, label: "Import to table" },
            { icon: ChartIcon, label: "Create dashboard" },
            { icon: WandIcon, label: "Analyze trends" },
          ].map((action, i) => (
            <button
              key={i}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-secondary/50 hover:bg-accent text-xs rounded-full border border-border/50 transition-all animate-in fade-in slide-in-from-bottom-2"
              style={{
                animationDelay: `${i * 80}ms`,
                animationFillMode: "both",
              }}
            >
              <action.icon className="w-3 h-3" />
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Animated chart bar
function ChartBar({ height, delay }: { height: number; delay: number }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delay + 300);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div
      className="w-12 bg-gradient-to-t from-violet-500 to-fuchsia-500 rounded-t transition-all duration-700 ease-out shadow-lg shadow-violet-500/20"
      style={{ height: visible ? `${height}%` : "0%" }}
    />
  );
}

// Dashboard Demo
function DashboardDemo() {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xl transition-all duration-300 hover:shadow-2xl">
      <div className="p-4 border-b border-border bg-muted/50 flex items-center justify-between">
        <span className="font-medium text-foreground">Q4 Sales Dashboard</span>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-lg shadow-green-500/50" />
          Live
        </div>
      </div>
      <div className="p-6">
        {/* Metrics row */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <MetricCard label="Revenue" value="$284k" change="+12%" />
          <MetricCard label="Orders" value="1,847" change="+8%" />
          <MetricCard label="AOV" value="$154" change="+4%" />
        </div>

        {/* Mini chart */}
        <div className="h-24 bg-muted rounded-lg flex items-end justify-around px-4 pb-2 gap-1 border border-border/50">
          {[40, 55, 45, 60, 70, 65, 80, 75, 90, 85, 95, 100].map((h, i) => (
            <div
              key={i}
              className="flex-1 bg-gradient-to-t from-violet-500/80 to-fuchsia-500/80 rounded-t transition-all duration-300 hover:from-violet-500 hover:to-fuchsia-500"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// Metric card with hover effect
function MetricCard({
  label,
  value,
  change,
}: {
  label: string;
  value: string;
  change: string;
}) {
  return (
    <div className="p-4 bg-muted rounded-lg border border-border/50 transition-all duration-200 hover:border-border hover:shadow-lg group cursor-default">
      <div className="text-sm text-muted-foreground mb-1">{label}</div>
      <div className="text-2xl font-bold text-foreground transition-transform duration-200 group-hover:scale-105">
        {value}
      </div>
      <div className="text-xs text-green-500 flex items-center gap-1">
        <svg
          className="w-3 h-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 10l7-7m0 0l7 7m-7-7v18"
          />
        </svg>
        {change} vs Q3
      </div>
    </div>
  );
}

// Icons
function SunIcon({ className }: { className?: string }) {
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
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
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
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

function MonitorIcon({ className }: { className?: string }) {
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
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <line x1="8" x2="16" y1="21" y2="21" />
      <line x1="12" x2="12" y1="17" y2="21" />
    </svg>
  );
}

function HandsLogo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
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

function SparklesIcon({ className }: { className?: string }) {
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
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="M5 3v4M19 17v4M3 5h4M17 19h4" />
    </svg>
  );
}

function ArrowUpIcon({ className }: { className?: string }) {
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
      <path d="m5 12 7-7 7 7" />
      <path d="M12 19V5" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
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
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function CameraIcon({ className }: { className?: string }) {
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
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

function MailIcon({ className }: { className?: string }) {
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
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
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
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function FolderIcon({ className }: { className?: string }) {
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
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
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
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function DatabaseIcon({ className }: { className?: string }) {
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
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5V19A9 3 0 0 0 21 19V5" />
      <path d="M3 12A9 3 0 0 0 21 12" />
    </svg>
  );
}

function ChartIcon({ className }: { className?: string }) {
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
      <path d="M3 3v18h18" />
      <path d="m19 9-5 5-4-4-3 3" />
    </svg>
  );
}

function WandIcon({ className }: { className?: string }) {
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
      <path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72" />
      <path d="m14 7 3 3" />
      <path d="M5 6v4" />
      <path d="M19 14v4" />
      <path d="M10 2v2" />
      <path d="M7 8H3" />
      <path d="M21 16h-4" />
      <path d="M11 3H9" />
    </svg>
  );
}
