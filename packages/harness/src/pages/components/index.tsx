/**
 * MDX Components for Harness Pages
 *
 * Styled to match Plate editor appearance.
 * These receive standard MDX props (children, className, etc.)
 */

import React from "react";

// Base typography - matches Plate's paragraph/heading styling
export const components = {
  // Headings - matches heading-node-static.tsx
  h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1 className="relative mb-1 mt-8 px-0.5 py-[3px] text-[1.875em] font-semibold leading-[1.3]" {...props} />
  ),
  h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 className="relative mb-1 mt-[1.4em] px-0.5 py-[3px] text-[1.5em] font-semibold leading-[1.3]" {...props} />
  ),
  h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className="relative mb-1 mt-[1em] px-0.5 py-[3px] text-[1.25em] font-semibold leading-[1.3]" {...props} />
  ),

  // Paragraph - matches paragraph-node-static.tsx
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="my-px px-0.5 py-[3px]" {...props} />
  ),

  // Text formatting
  strong: (props: React.HTMLAttributes<HTMLElement>) => (
    <strong className="font-bold" {...props} />
  ),
  em: (props: React.HTMLAttributes<HTMLElement>) => (
    <em className="italic" {...props} />
  ),

  // Lists - matches block-list-static.tsx
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="relative m-0 list-disc pl-6" {...props} />
  ),
  ol: (props: React.OlHTMLAttributes<HTMLOListElement>) => (
    <ol className="relative m-0 list-decimal pl-6" {...props} />
  ),
  li: (props: React.LiHTMLAttributes<HTMLLIElement>) => (
    <li className="my-px px-0.5 py-[3px]" {...props} />
  ),

  // Inline code - matches code-node-static.tsx
  code: (props: React.HTMLAttributes<HTMLElement>) => (
    <code className="whitespace-pre-wrap rounded-md bg-muted px-[0.3em] py-[0.2em] font-mono text-sm" {...props} />
  ),

  // Code block - matches code-block-node-static.tsx
  pre: (props: React.HTMLAttributes<HTMLPreElement>) => (
    <pre className="my-1 overflow-x-auto rounded-md bg-muted px-4 py-8 font-mono text-sm leading-normal [tab-size:2]" {...props} />
  ),

  // Links - matches link-node-static.tsx
  a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a className="font-medium text-primary underline decoration-primary underline-offset-4" {...props} />
  ),

  // Blockquote - matches blockquote-node-static.tsx
  blockquote: (props: React.HTMLAttributes<HTMLQuoteElement>) => (
    <blockquote className="my-1 px-0.5 py-[3px]" {...props}>
      <div className="border-l-[3px] border-primary px-4">{props.children}</div>
    </blockquote>
  ),

  // Horizontal rule - matches hr-node-static.tsx
  hr: (props: React.HTMLAttributes<HTMLHRElement>) => (
    <div className="mb-1 py-2">
      <hr className="h-0.5 cursor-pointer rounded-sm border-none bg-muted bg-clip-content" {...props} />
    </div>
  ),

  // Tables - matches table-node-static.tsx
  table: (props: React.TableHTMLAttributes<HTMLTableElement>) => (
    <div className="overflow-x-auto py-5">
      <table className="mr-0 ml-px table h-px table-fixed border-collapse" {...props} />
    </div>
  ),
  thead: (props: React.HTMLAttributes<HTMLTableSectionElement>) => (
    <thead {...props} />
  ),
  tbody: (props: React.HTMLAttributes<HTMLTableSectionElement>) => (
    <tbody className="min-w-full" {...props} />
  ),
  tr: (props: React.HTMLAttributes<HTMLTableRowElement>) => (
    <tr className="h-full" {...props} />
  ),
  th: (props: React.ThHTMLAttributes<HTMLTableCellElement>) => (
    <th className="h-full overflow-visible border border-border bg-background p-0 text-left font-normal" {...props}>
      <div className="relative z-20 box-border h-full px-4 py-2">{props.children}</div>
    </th>
  ),
  td: (props: React.TdHTMLAttributes<HTMLTableCellElement>) => (
    <td className="h-full overflow-visible border border-border bg-background p-0" {...props}>
      <div className="relative z-20 box-border h-full px-4 py-2">{props.children}</div>
    </td>
  ),

  // Images - matches media-image-node-static.tsx
  img: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <figure className="group relative m-0 inline-block py-2.5">
      <div className="relative min-w-[92px] max-w-full text-center">
        <img className="w-full max-w-full cursor-default rounded-sm object-cover" {...props} />
      </div>
    </figure>
  ),
};

// Re-export individual components
export const { h1, h2, h3, p, strong, em, ul, ol, li, code, pre, a, blockquote, hr, table, thead, tbody, tr, th, td, img } = components;
