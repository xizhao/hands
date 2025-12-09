'use client';

import * as React from 'react';
import type { PlateElementProps } from 'platejs/react';
import { PlateElement } from 'platejs/react';
import { KEYS } from 'platejs';

import { insertBlock } from '@/components/editor/transforms';
import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxGroup,
  InlineComboboxGroupLabel,
  InlineComboboxInput,
  InlineComboboxItem,
} from '@/components/ui/inline-combobox';

interface SlashItem {
  icon: React.ReactNode;
  value: string;
  focusEditor?: boolean;
  keywords?: string[];
  label?: string;
  onSelect?: (editor: any, value: string) => void;
}

interface SlashGroup {
  group: string;
  items: SlashItem[];
}

// Icons for slash menu items
const TextIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 7V4h16v3M9 20h6M12 4v16" />
  </svg>
);

const H1Icon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 12h8M4 18V6M12 18V6M17 12l3-2v8" />
  </svg>
);

const H2Icon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 12h8M4 18V6M12 18V6M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1" />
  </svg>
);

const H3Icon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 12h8M4 18V6M12 18V6M17.5 10.5c1.7-1 3.5 0 3.5 1.5a2 2 0 0 1-2 2c2 0 3 .5 3 2.5a2.5 2.5 0 0 1-2.5 2.5c-1.5 0-2.7-.8-3-2" />
  </svg>
);

const ListIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <circle cx="4" cy="6" r="1" fill="currentColor" />
    <circle cx="4" cy="12" r="1" fill="currentColor" />
    <circle cx="4" cy="18" r="1" fill="currentColor" />
  </svg>
);

const NumberedListIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="10" y1="6" x2="21" y2="6" />
    <line x1="10" y1="12" x2="21" y2="12" />
    <line x1="10" y1="18" x2="21" y2="18" />
    <text x="2" y="8" fontSize="8" fill="currentColor">1</text>
    <text x="2" y="14" fontSize="8" fill="currentColor">2</text>
    <text x="2" y="20" fontSize="8" fill="currentColor">3</text>
  </svg>
);

const QuoteIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z" />
    <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v4z" />
  </svg>
);

const CodeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
);

const DividerIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="2" y1="12" x2="22" y2="12" />
  </svg>
);

// Define slash menu groups and items
const groups: SlashGroup[] = [
  {
    group: 'Basic blocks',
    items: [
      {
        icon: <TextIcon />,
        value: KEYS.p,
        label: 'Paragraph',
        keywords: ['paragraph', 'text', 'plain'],
        focusEditor: true,
        onSelect: (editor, value) => {
          insertBlock(editor, value);
        },
      },
      {
        icon: <H1Icon />,
        value: KEYS.h1,
        label: 'Heading 1',
        keywords: ['title', 'h1', 'heading 1'],
        focusEditor: true,
        onSelect: (editor, value) => {
          insertBlock(editor, value);
        },
      },
      {
        icon: <H2Icon />,
        value: KEYS.h2,
        label: 'Heading 2',
        keywords: ['subtitle', 'h2', 'heading 2'],
        focusEditor: true,
        onSelect: (editor, value) => {
          insertBlock(editor, value);
        },
      },
      {
        icon: <H3Icon />,
        value: KEYS.h3,
        label: 'Heading 3',
        keywords: ['h3', 'heading 3'],
        focusEditor: true,
        onSelect: (editor, value) => {
          insertBlock(editor, value);
        },
      },
      {
        icon: <ListIcon />,
        value: KEYS.ul,
        label: 'Bulleted list',
        keywords: ['unordered', 'ul', 'bullet', 'list'],
        focusEditor: true,
        onSelect: (editor, value) => {
          insertBlock(editor, value);
        },
      },
      {
        icon: <NumberedListIcon />,
        value: KEYS.ol,
        label: 'Numbered list',
        keywords: ['ordered', 'ol', 'number', 'list'],
        focusEditor: true,
        onSelect: (editor, value) => {
          insertBlock(editor, value);
        },
      },
      {
        icon: <QuoteIcon />,
        value: KEYS.blockquote,
        label: 'Quote',
        keywords: ['blockquote', 'quote', 'citation'],
        focusEditor: true,
        onSelect: (editor, value) => {
          insertBlock(editor, value);
        },
      },
      {
        icon: <CodeIcon />,
        value: KEYS.codeBlock,
        label: 'Code block',
        keywords: ['code', 'codeblock', 'snippet'],
        focusEditor: true,
        onSelect: (editor, value) => {
          insertBlock(editor, value);
        },
      },
      {
        icon: <DividerIcon />,
        value: KEYS.hr,
        label: 'Divider',
        keywords: ['hr', 'divider', 'separator', 'line'],
        focusEditor: true,
        onSelect: (editor, value) => {
          insertBlock(editor, value);
        },
      },
    ],
  },
];

export function SlashInputElement(props: PlateElementProps) {
  const { editor, element } = props;

  return (
    <PlateElement {...props} as="span">
      <InlineCombobox element={element} trigger="/">
        <InlineComboboxInput />
        <InlineComboboxContent>
          <InlineComboboxEmpty>No results</InlineComboboxEmpty>
          {groups.map(({ group, items }) => (
            <InlineComboboxGroup key={group}>
              <InlineComboboxGroupLabel>{group}</InlineComboboxGroupLabel>
              {items.map(({ focusEditor, icon, keywords, label, value, onSelect }) => (
                <InlineComboboxItem
                  key={value}
                  value={value}
                  onClick={() => onSelect?.(editor, value)}
                  label={label}
                  focusEditor={focusEditor}
                  group={group}
                  keywords={keywords}
                >
                  <div className="mr-2 text-muted-foreground">{icon}</div>
                  {label ?? value}
                </InlineComboboxItem>
              ))}
            </InlineComboboxGroup>
          ))}
        </InlineComboboxContent>
      </InlineCombobox>
      {props.children}
    </PlateElement>
  );
}
