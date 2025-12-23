/**
 * MDX Language Configuration for Monaco
 *
 * Registers MDX as a custom language with syntax highlighting
 * that combines Markdown with JSX/TSX.
 */

import type { Monaco } from "@monaco-editor/react";

/**
 * Register the MDX language with Monaco.
 * This should be called once when Monaco is loaded.
 */
export function registerMdxLanguage(monaco: Monaco) {
  // Register MDX as a language
  monaco.languages.register({
    id: "mdx",
    extensions: [".mdx"],
    aliases: ["MDX", "mdx"],
    mimetypes: ["text/mdx"],
  });

  // Set the tokenizer rules
  monaco.languages.setMonarchTokensProvider("mdx", {
    defaultToken: "",
    tokenPostfix: ".mdx",

    // Control characters
    control: /[\\`*_\[\]{}()#+\-\.!]/,
    noncontrol: /[^\\`*_\[\]{}()#+\-\.!]/,
    escapes: /\\(?:@control)/,

    // JSX patterns
    jsxTagName: /[A-Z][a-zA-Z0-9]*/,
    jsxAttribute: /[a-zA-Z_][a-zA-Z0-9_-]*/,

    tokenizer: {
      root: [
        // Frontmatter (YAML between ---)
        [/^---$/, { token: "meta.separator", next: "@frontmatter" }],

        // JSX Components (PascalCase)
        [
          /(<)([A-Z][a-zA-Z0-9]*)/,
          [
            { token: "delimiter.tag" },
            { token: "tag.component", next: "@jsxTag" },
          ],
        ],
        [
          /(<\/)([A-Z][a-zA-Z0-9]*)(>)/,
          [
            { token: "delimiter.tag" },
            { token: "tag.component" },
            { token: "delimiter.tag" },
          ],
        ],

        // Self-closing JSX component
        [
          /(<)([A-Z][a-zA-Z0-9]*)(\s*\/>)/,
          [
            { token: "delimiter.tag" },
            { token: "tag.component" },
            { token: "delimiter.tag" },
          ],
        ],

        // JSX expressions {expression}
        [/{/, { token: "delimiter.bracket", next: "@jsxExpression" }],

        // Headers
        [/^(\s{0,3})(#+)((?:[^\\#]|@escapes)+)((?:#+)?)/, "heading"],

        // Code blocks with language
        [/^\s*```\s*(\w+)\s*$/, { token: "keyword.code", next: "@codeblock" }],
        [/^\s*```\s*$/, { token: "keyword.code", next: "@codeblock" }],

        // Inline code
        [/`[^`]+`/, "keyword.code"],

        // Block quotes
        [/^\s*>+/, "comment.quote"],

        // Lists
        [/^\s*([\*\-+]|\d+\.)\s/, "keyword.list"],

        // Links and images
        [/!?\[/, { token: "string.link", next: "@linkText" }],

        // Bold
        [/\*\*([^*]|\*(?!\*))+\*\*/, "strong"],
        [/__([^_]|_(?!_))+__/, "strong"],

        // Italic
        [/\*([^*]|\*\*)+\*/, "emphasis"],
        [/_([^_]|__)+_/, "emphasis"],

        // Horizontal rule
        [/^\s*([\*\-_])\s*\1\s*\1(\s*\1)*\s*$/, "keyword.hr"],

        // HTML tags (lowercase)
        [
          /<(\w+)/,
          { token: "tag", next: "@htmlTag" },
        ],
        [/<\/\w+>/, "tag"],
      ],

      // Frontmatter (YAML)
      frontmatter: [
        [/^---$/, { token: "meta.separator", next: "@pop" }],
        [/[a-zA-Z_][a-zA-Z0-9_]*(?=\s*:)/, "attribute.name"],
        [/:/, "delimiter"],
        [/"[^"]*"/, "string"],
        [/'[^']*'/, "string"],
        [/\d+/, "number"],
        [/true|false/, "keyword"],
        [/null/, "keyword"],
        [/./, ""],
      ],

      // JSX tag attributes
      jsxTag: [
        [/\s+/, ""],
        [
          /([a-zA-Z_][a-zA-Z0-9_-]*)(=)/,
          [{ token: "attribute.name" }, { token: "delimiter" }],
        ],
        [/"[^"]*"/, "attribute.value"],
        [/'[^']*'/, "attribute.value"],
        [/{/, { token: "delimiter.bracket", next: "@jsxExpression" }],
        [/>/, { token: "delimiter.tag", next: "@jsxContent" }],
        [/\/>/, { token: "delimiter.tag", next: "@pop" }],
      ],

      // Content inside JSX tags
      jsxContent: [
        [
          /(<\/)([A-Z][a-zA-Z0-9]*)(>)/,
          [
            { token: "delimiter.tag" },
            { token: "tag.component" },
            { token: "delimiter.tag", next: "@pop" },
          ],
        ],
        [
          /(<)([A-Z][a-zA-Z0-9]*)/,
          [
            { token: "delimiter.tag" },
            { token: "tag.component", next: "@jsxTag" },
          ],
        ],
        [/{/, { token: "delimiter.bracket", next: "@jsxExpression" }],
        [/[^<{]+/, ""],
      ],

      // JSX expression inside { }
      jsxExpression: [
        [/}/, { token: "delimiter.bracket", next: "@pop" }],
        [/"[^"]*"/, "string"],
        [/'[^']*'/, "string"],
        [/`[^`]*`/, "string"],
        [/\d+(\.\d+)?/, "number"],
        [/true|false|null|undefined/, "keyword"],
        [/[a-zA-Z_][a-zA-Z0-9_]*/, "variable"],
        [/[+\-*/=<>!&|?:]/, "operator"],
        [/[()[\],.]/, "delimiter"],
        [/\s+/, ""],
      ],

      // Code blocks
      codeblock: [
        [/^\s*```\s*$/, { token: "keyword.code", next: "@pop" }],
        [/.*$/, "variable.source"],
      ],

      // Link text
      linkText: [
        [/\]/, { token: "string.link", next: "@linkUrl" }],
        [/./, "string.link"],
      ],

      // Link URL
      linkUrl: [
        [/\(/, { token: "string.link", next: "@linkUrlInner" }],
        [/./, { token: "", next: "@pop" }],
      ],

      linkUrlInner: [
        [/\)/, { token: "string.link", next: "@popall" }],
        [/./, "string.link"],
      ],

      // HTML tag
      htmlTag: [
        [/\s+/, ""],
        [/(\w+)(=)/, [{ token: "attribute.name" }, { token: "delimiter" }]],
        [/"[^"]*"/, "attribute.value"],
        [/'[^']*'/, "attribute.value"],
        [/>/, { token: "tag", next: "@pop" }],
        [/\/>/, { token: "tag", next: "@pop" }],
      ],
    },
  });

  // Set language configuration for better editing experience
  monaco.languages.setLanguageConfiguration("mdx", {
    comments: {
      blockComment: ["{/*", "*/}"],
    },
    brackets: [
      ["{", "}"],
      ["[", "]"],
      ["(", ")"],
      ["<", ">"],
    ],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: "`", close: "`" },
      { open: "<", close: ">" },
    ],
    surroundingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: "`", close: "`" },
      { open: "<", close: ">" },
      { open: "*", close: "*" },
      { open: "_", close: "_" },
    ],
    folding: {
      markers: {
        start: /^\s*<!--\s*#region\b.*-->/,
        end: /^\s*<!--\s*#endregion\b.*-->/,
      },
    },
  });
}
