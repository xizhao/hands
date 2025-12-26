"use client";

/**
 * Slides View
 *
 * Presentation view that renders editor content as slides.
 * Each heading (h1, h2, h3) starts a new slide.
 */

import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { cn } from "@udecode/cn";
import type { TElement } from "platejs";
import {
  Plate,
  PlateContent,
  useEditorRef,
  usePlateEditor,
} from "platejs/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useMarkdownWorker } from "../hooks/use-markdown-worker";
import { DefaultEditorPlugins } from "../plugins/editor-config";
import { Button } from "./button";

// ============================================================================
// Slide Parsing
// ============================================================================

interface Slide {
  id: string;
  title: string;
  depth: number;
  content: string;
  startIndex: number;
  endIndex: number;
}

/** Parse markdown into slides by splitting on headers */
function parseSlides(markdown: string): Slide[] {
  const slides: Slide[] = [];
  const headerRegex = /^(#{1,3})\s+(.+)$/gm;

  let match: RegExpExecArray | null;
  let slideId = 0;

  while ((match = headerRegex.exec(markdown)) !== null) {
    // Close previous slide
    if (slides.length > 0) {
      const prevSlide = slides[slides.length - 1];
      if (prevSlide.endIndex === -1) {
        prevSlide.endIndex = match.index;
        prevSlide.content = markdown.slice(prevSlide.startIndex, match.index).trim();
      }
    }

    const depth = match[1].length as 1 | 2 | 3;
    const title = match[2].trim();

    slides.push({
      id: `slide-${slideId++}`,
      title,
      depth,
      content: "",
      startIndex: match.index,
      endIndex: -1,
    });
  }

  // Close last slide
  if (slides.length > 0) {
    const lastSlide = slides[slides.length - 1];
    if (lastSlide.endIndex === -1) {
      lastSlide.endIndex = markdown.length;
      lastSlide.content = markdown.slice(lastSlide.startIndex).trim();
    }
  }

  return slides;
}

// ============================================================================
// Slides View
// ============================================================================

interface SlidesViewProps {
  className?: string;
  /** Frontmatter for title slide */
  frontmatter?: { title?: string; subtitle?: string } | null;
}

export function SlidesView({ className, frontmatter }: SlidesViewProps) {
  const parentEditor = useEditorRef();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [slides, setSlides] = useState<Slide[]>([]);
  const markdownRef = useRef<string>("");
  const { serialize, deserialize } = useMarkdownWorker();

  // Get markdown from parent editor (async)
  const getMarkdown = useCallback(async () => {
    try {
      const nodes = parentEditor.children as TElement[];
      return await serialize(nodes);
    } catch {
      return "";
    }
  }, [parentEditor, serialize]);

  // Update parent editor from markdown (async)
  const setMarkdown = useCallback(
    async (markdown: string) => {
      try {
        const nodes = await deserialize(markdown);
        if (nodes && nodes.length > 0) {
          parentEditor.tf.setValue(nodes);
        }
      } catch (err) {
        console.error("[SlidesView] Failed to set markdown:", err);
      }
    },
    [parentEditor, deserialize]
  );

  // Parse slides from current markdown, prepend title slide if frontmatter exists
  useEffect(() => {
    let cancelled = false;

    async function loadSlides() {
      const md = await getMarkdown();
      if (cancelled) return;

      markdownRef.current = md;
      const contentSlides = parseSlides(md);

      // Add title slide from frontmatter
      if (frontmatter?.title) {
        const titleSlide: Slide = {
          id: "slide-title",
          title: frontmatter.title,
          depth: 0, // Special depth for title slide
          content: "", // Title slide renders specially
          startIndex: -1,
          endIndex: -1,
        };
        setSlides([titleSlide, ...contentSlides]);
      } else {
        setSlides(contentSlides);
      }
    }

    loadSlides();

    return () => {
      cancelled = true;
    };
  }, [getMarkdown, parentEditor.children, frontmatter]);

  // Reset to valid slide index when slides change
  useEffect(() => {
    if (currentIndex >= slides.length) {
      setCurrentIndex(Math.max(0, slides.length - 1));
    }
  }, [slides.length, currentIndex]);

  const currentSlide = slides[currentIndex];

  const goToPrev = useCallback(() => {
    setCurrentIndex((i) => Math.max(0, i - 1));
  }, []);

  const goToNext = useCallback(() => {
    setCurrentIndex((i) => Math.min(slides.length - 1, i + 1));
  }, [slides.length]);

  // Handle slide content change
  const handleSlideChange = useCallback(
    async (newContent: string) => {
      const fullMarkdown = markdownRef.current;
      const slide = slides[currentIndex];
      if (!slide) return;

      const before = fullMarkdown.slice(0, slide.startIndex);
      const after = fullMarkdown.slice(slide.endIndex);
      const newMarkdown = before + newContent + after;

      markdownRef.current = newMarkdown;
      await setMarkdown(newMarkdown);
    },
    [slides, currentIndex, setMarkdown]
  );

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-slate-editor]")) return;

      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        goToPrev();
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        goToNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goToPrev, goToNext]);

  // Check if current slide is the title slide
  const isTitleSlide = currentSlide?.id === "slide-title";

  if (slides.length === 0) {
    return (
      <div className={cn("flex items-center justify-center h-full text-muted-foreground", className)}>
        No slides found - add headings (# ## ###) to create slides
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Slide content */}
      <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center p-8">
        <div className="w-full max-w-4xl">
          {isTitleSlide ? (
            <TitleSlide
              title={frontmatter?.title || ""}
              subtitle={frontmatter?.subtitle}
            />
          ) : (
            <SlideEditor
              key={currentSlide.id}
              content={currentSlide.content}
              onChange={handleSlideChange}
            />
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-shrink-0 border-t border-border/50 bg-muted/30 px-4 py-3">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <Button
            variant="ghost"
            size="xs"
            onClick={goToPrev}
            disabled={currentIndex === 0}
            className="gap-1"
          >
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">Previous</span>
          </Button>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {currentIndex + 1} / {slides.length}
            </span>
            <div className="hidden sm:flex gap-1">
              {slides.map((slide, i) => (
                <button
                  key={slide.id}
                  onClick={() => setCurrentIndex(i)}
                  className={cn(
                    "w-2 h-2 rounded-full transition-colors",
                    i === currentIndex
                      ? "bg-primary"
                      : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
                  )}
                  aria-label={`Go to slide ${i + 1}: ${slide.title}`}
                />
              ))}
            </div>
          </div>

          <Button
            variant="ghost"
            size="xs"
            onClick={goToNext}
            disabled={currentIndex === slides.length - 1}
            className="gap-1"
          >
            <span className="hidden sm:inline">Next</span>
            <ArrowRight size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Title Slide
// ============================================================================

function TitleSlide({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <h1 className="text-5xl font-bold mb-4">{title}</h1>
      {subtitle && (
        <p className="text-2xl text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}

// ============================================================================
// Slide Editor
// ============================================================================

function SlideEditor({
  content,
  onChange,
}: {
  content: string;
  onChange: (markdown: string) => void;
}) {
  const hasInitializedRef = useRef(false);
  const { serialize, deserialize } = useMarkdownWorker();

  // Create editor with shared config
  const editor = usePlateEditor({
    plugins: DefaultEditorPlugins,
    value: [{ type: "p", children: [{ text: "" }] }],
  });

  // Deserialize and set content
  useEffect(() => {
    if (!content.trim()) return;

    let cancelled = false;

    async function initContent() {
      try {
        const nodes = await deserialize(content);
        if (cancelled) return;
        if (nodes && nodes.length > 0) {
          editor.tf.setValue(nodes);
          hasInitializedRef.current = true;
        }
      } catch (err) {
        console.error("[SlideEditor] Failed to deserialize:", err);
      }
    }

    initContent();

    return () => {
      cancelled = true;
    };
  }, [editor, content, deserialize]);

  // Handle changes
  const handleChange = useCallback(
    async ({ value }: { value: TElement[] }) => {
      if (!hasInitializedRef.current) return;

      try {
        const markdown = await serialize(value);
        onChange(markdown);
      } catch {
        // Ignore serialization errors
      }
    },
    [serialize, onChange]
  );

  if (!content.trim()) {
    return (
      <div className="text-muted-foreground text-center py-12">
        Empty slide
      </div>
    );
  }

  return (
    <Plate editor={editor} onChange={handleChange}>
      <PlateContent
        className={cn(
          "outline-none",
          "prose prose-lg dark:prose-invert max-w-none",
          "[&_h1]:text-4xl [&_h1]:font-bold [&_h1]:mb-6",
          "[&_h2]:text-3xl [&_h2]:font-semibold [&_h2]:mb-4",
          "[&_h3]:text-2xl [&_h3]:font-semibold [&_h3]:mb-3",
          "[&_p]:text-xl [&_p]:leading-relaxed [&_p]:mb-4",
          "[&_li]:text-lg",
          "[&_ul]:space-y-2 [&_ol]:space-y-2",
          "[&_blockquote]:text-xl [&_blockquote]:border-l-4 [&_blockquote]:border-primary/50",
          "[&_pre]:text-sm"
        )}
      />
    </Plate>
  );
}
