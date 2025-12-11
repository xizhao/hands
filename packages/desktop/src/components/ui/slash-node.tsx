'use client';

/**
 * Slash Menu - Dynamic slash command menu
 *
 * Loads ALL components from @hands/stdlib registry.
 * No hardcoded block types - everything comes from the registry.
 */

import { AIChatPlugin } from '@platejs/ai/react';
import { BlockSelectionPlugin } from '@platejs/selection/react';
import {
  AudioLinesIcon,
  BarChart3Icon,
  CalendarIcon,
  ChevronDownIcon,
  Code2Icon,
  Columns3Icon,
  DatabaseIcon,
  FileUpIcon,
  FilmIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ImageIcon,
  LayoutGridIcon,
  LightbulbIcon,
  ListIcon,
  ListOrderedIcon,
  type LucideIcon,
  type LucideProps,
  MinusIcon,
  PilcrowIcon,
  QuoteIcon,
  RadicalIcon,
  SquareCheckIcon,
  TableIcon,
  TableOfContentsIcon,
  TrendingUpIcon,
} from 'lucide-react';
import { KEYS } from 'platejs';
import type { PlateEditor, PlateElementProps } from 'platejs/react';
import { PlateElement } from 'platejs/react';
import * as React from 'react';

import {
  insertBlock,
  insertInlineElement,
  insertStdlibComponent,
  setBlockType,
} from '@/components/editor/transforms';
import { blockMenuItems } from '@/components/ui/block-menu';
import { listComponents, listCategories, type ComponentMeta } from '@hands/stdlib/registry';

import {
  backgroundColorItems,
  ColorIcon,
  textColorItems,
} from './font-color-toolbar-button';
import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxGroup,
  InlineComboboxGroupLabel,
  InlineComboboxInput,
  InlineComboboxItem,
} from './inline-combobox';
import { turnIntoItems } from './turn-into-toolbar-button';

type Group = {
  group: string;
  items: {
    icon: React.ReactNode;
    value: string;
    onSelect: (editor: PlateEditor, value: string) => void;
    description?: string;
    focusEditor?: boolean;
    keywords?: string[];
    label?: string;
  }[];
};

function AIIcon(props: LucideProps) {
  return (
    <svg
      fill="url(#myGradient)"
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <defs>
        <linearGradient id="myGradient" x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stopColor="#6EB6F2" />
          <stop offset="15%" stopColor="#6EB6F2" />
          <stop offset="40%" stopColor="#c084fc" />
          <stop offset="60%" stopColor="#f87171" />
          <stop offset="100%" stopColor="#fcd34d" />
        </linearGradient>
      </defs>
      <path d="M161.15 362.26a40.902 40.902 0 0 0 23.78 7.52v-.11a40.989 40.989 0 0 0 37.75-24.8l17.43-53.02a81.642 81.642 0 0 1 51.68-51.53l50.57-16.44a41.051 41.051 0 0 0 20.11-15.31 40.964 40.964 0 0 0 7.32-24.19 41.077 41.077 0 0 0-8.23-23.89 41.051 41.051 0 0 0-20.68-14.54l-49.92-16.21a81.854 81.854 0 0 1-51.82-51.85L222.7 27.33A41.11 41.11 0 0 0 183.63.01c-8.54.07-16.86 2.8-23.78 7.81A41.152 41.152 0 0 0 145 27.97l-16.58 50.97c-4 11.73-10.61 22.39-19.33 31.19s-19.33 15.5-31.01 19.61l-50.54 16.24a41.131 41.131 0 0 0-15.89 10.14 41.059 41.059 0 0 0-9.69 16.17 41.144 41.144 0 0 0-1.44 18.8c.98 6.29 3.42 12.27 7.11 17.46a41.312 41.312 0 0 0 20.39 15.19l49.89 16.18a82.099 82.099 0 0 1 32.11 19.91c2.42 2.4 4.68 4.96 6.77 7.65a81.567 81.567 0 0 1 12.94 24.38l16.44 50.49a40.815 40.815 0 0 0 14.98 19.91zm218.06 143.57c-5.42-3.86-9.5-9.32-11.66-15.61l-9.33-28.64a37.283 37.283 0 0 0-8.9-14.48c-4.05-4.06-9-7.12-14.45-8.93l-28.19-9.19a32.655 32.655 0 0 1-16.24-12.06 32.062 32.062 0 0 1-5.97-18.74c.01-6.76 2.13-13.35 6.06-18.86 3.91-5.53 9.46-9.68 15.87-11.86l28.61-9.27a37.013 37.013 0 0 0 14.08-9.01c3.95-4.04 6.91-8.93 8.67-14.29l9.22-28.22a32.442 32.442 0 0 1 11.72-15.87 32.476 32.476 0 0 1 18.74-6.17c6.74-.07 13.33 1.96 18.86 5.81 5.53 3.84 9.74 9.31 12.03 15.64l9.36 28.84a36.832 36.832 0 0 0 8.94 14.34c4.05 4.03 8.97 7.06 14.39 8.87l28.22 9.19a32.44 32.44 0 0 1 16.29 11.52 32.465 32.465 0 0 1 6.47 18.87 32.458 32.458 0 0 1-21.65 31.19l-28.84 9.36a37.384 37.384 0 0 0-14.36 8.93c-4.05 4.06-7.1 9.01-8.9 14.45l-9.16 28.13A32.492 32.492 0 0 1 417 505.98a32.005 32.005 0 0 1-18.74 6.03 32.508 32.508 0 0 1-19.05-6.18z" />
    </svg>
  );
}

// Map icon names from registry to Lucide components
const iconMap: Record<string, LucideIcon> = {
  'pilcrow': PilcrowIcon,
  'heading-1': Heading1Icon,
  'heading-2': Heading2Icon,
  'heading-3': Heading3Icon,
  'list': ListIcon,
  'list-ordered': ListOrderedIcon,
  'square-check': SquareCheckIcon,
  'chevron-down': ChevronDownIcon,
  'code': Code2Icon,
  'table': TableIcon,
  'quote': QuoteIcon,
  'lightbulb': LightbulbIcon,
  'minus': MinusIcon,
  'image': ImageIcon,
  'film': FilmIcon,
  'audio-lines': AudioLinesIcon,
  'file-up': FileUpIcon,
  'radical': RadicalIcon,
  'table-of-contents': TableOfContentsIcon,
  'columns': Columns3Icon,
  'calendar': CalendarIcon,
  'layout-grid': LayoutGridIcon,
  'database': DatabaseIcon,
  'bar-chart-3': BarChart3Icon,
  'trending-up': TrendingUpIcon,
};

function getIcon(iconName?: string, category?: string): React.ReactNode {
  if (iconName && iconMap[iconName]) {
    const Icon = iconMap[iconName];
    return <Icon />;
  }

  // Fallback based on category
  switch (category) {
    case 'charts':
      return <BarChart3Icon />;
    case 'data':
      return <DatabaseIcon />;
    case 'ui':
      return <LayoutGridIcon />;
    default:
      return <LayoutGridIcon />;
  }
}

// Map plateKey to actual KEYS values
const plateKeyMap: Record<string, string> = {
  'p': KEYS.p,
  'h1': KEYS.h1,
  'h2': KEYS.h2,
  'h3': KEYS.h3,
  'ul': KEYS.ul,
  'ol': KEYS.ol,
  'action_item': KEYS.listTodo,
  'toggle': KEYS.toggle,
  'code_block': KEYS.codeBlock,
  'table': KEYS.table,
  'blockquote': KEYS.blockquote,
  'callout': KEYS.callout,
  'hr': KEYS.hr,
  'img': KEYS.img,
  'video': KEYS.video,
  'audio': KEYS.audio,
  'file': KEYS.file,
  'equation': KEYS.equation,
  'toc': KEYS.toc,
  'action_three_columns': 'action_three_columns',
  'inline_equation': KEYS.inlineEquation,
  'date': KEYS.date,
};

/**
 * Build slash menu groups from stdlib registry
 */
function buildGroups(): Group[] {
  const categories = listCategories();
  const components = listComponents();

  // AI group (special, not from registry)
  const aiGroup: Group = {
    group: 'AI',
    items: [
      {
        description: 'Use AI to generate content.',
        focusEditor: false,
        icon: <AIIcon />,
        keywords: ['ai', 'generate', 'help', 'chat'],
        value: 'AI',
        onSelect: (editor) => {
          editor.getApi(AIChatPlugin).aiChat.show();
        },
      },
    ],
  };

  // Build groups from registry categories
  const registryGroups: Group[] = categories
    .filter((cat) => !['inline', 'layout'].includes(cat.key)) // Handle these specially
    .map((category) => {
      const categoryComponents = components.filter(
        (comp) => comp.category === category.key
      );

      return {
        group: category.name,
        items: categoryComponents.map((comp) => {
          const plateKey = comp.plateKey ? plateKeyMap[comp.plateKey] : null;
          const isStdlibComponent = comp.files && comp.files.length > 0;

          return {
            description: comp.description,
            icon: getIcon(comp.icon, comp.category),
            keywords: comp.keywords || [comp.key, comp.category],
            label: comp.name,
            value: plateKey || `stdlib:${comp.name}`,
            focusEditor: ['media', 'blocks'].includes(comp.category) ? undefined : false,
            onSelect: (editor: PlateEditor) => {
              if (isStdlibComponent) {
                // Custom stdlib component (ui, data, charts)
                insertStdlibComponent(editor, comp.name);
              } else if (plateKey) {
                // Plate block type
                insertBlock(editor, plateKey);
              }
            },
          };
        }),
      };
    })
    .filter((group) => group.items.length > 0);

  // Layout group (special handling for columns)
  const layoutComponents = components.filter((comp) => comp.category === 'layout');
  const layoutGroup: Group | null = layoutComponents.length > 0 ? {
    group: 'Layout',
    items: layoutComponents.map((comp) => {
      const plateKey = comp.plateKey ? plateKeyMap[comp.plateKey] : null;
      return {
        description: comp.description,
        icon: getIcon(comp.icon, comp.category),
        keywords: comp.keywords || [comp.key],
        label: comp.name,
        value: plateKey || comp.key,
        onSelect: (editor: PlateEditor) => {
          if (plateKey) {
            insertBlock(editor, plateKey);
          }
        },
      };
    }),
  } : null;

  // Inline group (special handling for inline elements)
  const inlineComponents = components.filter((comp) => comp.category === 'inline');
  const inlineGroup: Group | null = inlineComponents.length > 0 ? {
    group: 'Inline',
    items: inlineComponents.map((comp) => {
      const plateKey = comp.plateKey ? plateKeyMap[comp.plateKey] : null;
      return {
        description: comp.description,
        focusEditor: comp.plateKey === 'date' ? true : false,
        icon: getIcon(comp.icon, comp.category),
        keywords: comp.keywords || [comp.key],
        label: comp.name,
        value: plateKey || comp.key,
        onSelect: (editor: PlateEditor) => {
          if (plateKey) {
            insertInlineElement(editor, plateKey);
          }
        },
      };
    }),
  } : null;

  // Turn into group
  const turnIntoGroup: Group = {
    group: 'Turn into',
    items: turnIntoItems.map((item) => ({
      ...item,
      onSelect: (editor) => {
        setBlockType(editor, item.value);
      },
    })),
  };

  // Actions group
  const actionsGroup: Group = {
    group: 'Actions',
    items: [
      {
        ...blockMenuItems.delete,
        onSelect: (editor) => {
          editor.tf.removeNodes();
        },
      },
      {
        ...blockMenuItems.duplicate,
        onSelect: (editor) => {
          editor.getTransforms(BlockSelectionPlugin).blockSelection.duplicate();
        },
      },
    ],
  };

  // Text color group
  const textColorGroup: Group = {
    group: 'Text color',
    items: textColorItems.map((item) => ({
      ...item,
      icon: <ColorIcon group="color" value={item.value} />,
      onSelect: (editor) => {
        editor.tf.setNodes(
          { color: item.value },
          { at: editor.api.block()![1], mode: 'lowest' }
        );
      },
    })),
  };

  // Background color group
  const bgColorGroup: Group = {
    group: 'Background color',
    items: backgroundColorItems.map((item) => ({
      ...item,
      icon: <ColorIcon group="background" value={item.value} />,
      onSelect: (editor) => {
        editor.tf.setNodes(
          { backgroundColor: item.value },
          { at: editor.api.block()![1] }
        );
      },
    })),
  };

  // Combine all groups
  return [
    aiGroup,
    ...registryGroups,
    ...(layoutGroup ? [layoutGroup] : []),
    ...(inlineGroup ? [inlineGroup] : []),
    turnIntoGroup,
    actionsGroup,
    textColorGroup,
    bgColorGroup,
  ];
}

// Build groups once at module load
const groups = buildGroups();

export function SlashInputElement(props: PlateElementProps) {
  const { children, editor, element } = props;

  return (
    <PlateElement {...props} as="span">
      <InlineCombobox element={element} trigger="/">
        <InlineComboboxInput />

        <InlineComboboxContent variant="slash">
          <InlineComboboxEmpty>No results</InlineComboboxEmpty>

          {groups.map(({ group, items }) => (
            <InlineComboboxGroup key={group}>
              <InlineComboboxGroupLabel>{group}</InlineComboboxGroupLabel>
              {items.map(
                ({
                  description,
                  focusEditor,
                  icon,
                  keywords,
                  label,
                  value,
                  onSelect,
                }) => (
                  <InlineComboboxItem
                    focusEditor={focusEditor}
                    group={group}
                    key={value}
                    keywords={keywords}
                    label={label}
                    onClick={() => onSelect(editor, value)}
                    value={value}
                  >
                    {description ? (
                      <>
                        <div className="flex size-11 items-center justify-center rounded border border-border bg-background [&_svg]:size-5 [&_svg]:text-subtle-foreground">
                          {icon}
                        </div>
                        <div className="ml-3 flex flex-1 flex-col truncate">
                          <span>{label ?? value}</span>
                          <span className="truncate text-muted-foreground text-xs">
                            {description}
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="mr-2 text-subtle-foreground">
                          {icon}
                        </div>
                        {label ?? value}
                      </>
                    )}
                  </InlineComboboxItem>
                )
              )}
            </InlineComboboxGroup>
          ))}
        </InlineComboboxContent>
      </InlineCombobox>

      {children}
    </PlateElement>
  );
}
