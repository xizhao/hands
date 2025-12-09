/**
 * Text Block - Rich text content block
 */
import * as React from "react";

export interface TextBlockProps {
  content: string;
  format?: "markdown" | "html" | "plain";
}

export function TextBlock({ content, format = "plain" }: TextBlockProps) {
  if (!content) {
    return (
      <div className="p-4 text-muted-foreground text-sm italic">
        Empty text block
      </div>
    );
  }

  if (format === "html") {
    return (
      <div
        className="prose prose-sm dark:prose-invert max-w-none"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    );
  }

  // For markdown/plain, just render as paragraphs (full markdown parsing would need a library)
  const paragraphs = content.split("\n\n");

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none space-y-4">
      {paragraphs.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  );
}
