/**
 * Slash Menu - Command menu for inserting blocks
 * Simplified from desktop version - focused on stdlib components
 */

import {
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ListIcon,
  MinusIcon,
  PilcrowIcon,
  QuoteIcon,
  LayoutGridIcon,
  type LucideIcon,
} from 'lucide-react'
import { KEYS, type TElement } from 'platejs'
import type { PlateEditor, PlateElementProps } from 'platejs/react'
import { PlateElement, useEditorRef } from 'platejs/react'
import * as React from 'react'

import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxGroup,
  InlineComboboxGroupLabel,
  InlineComboboxInput,
  InlineComboboxItem,
} from './inline-combobox'

// Import stdlib component insertion
import { STDLIB_COMPONENT_KEY } from '../stdlib-component-plugin'

type Group = {
  group: string
  items: {
    icon: React.ReactNode
    value: string
    onSelect: (editor: PlateEditor) => void
    description?: string
    keywords?: string[]
    label?: string
  }[]
}

function insertBlock(editor: PlateEditor, type: string) {
  editor.tf.setNodes({ type } as Partial<TElement>)
}

function insertStdlibComponent(editor: PlateEditor, componentName: string) {
  const node: TElement = {
    type: STDLIB_COMPONENT_KEY,
    componentName,
    props: {},
    children: [{ text: '' }],
  }
  editor.tf.insertNodes(node)
}

// Build the slash menu groups
const groups: Group[] = [
  {
    group: 'Basic Blocks',
    items: [
      {
        icon: <PilcrowIcon />,
        label: 'Paragraph',
        value: KEYS.p,
        keywords: ['text', 'paragraph'],
        onSelect: (editor) => insertBlock(editor, KEYS.p),
      },
      {
        icon: <Heading1Icon />,
        label: 'Heading 1',
        value: KEYS.h1,
        keywords: ['h1', 'title'],
        onSelect: (editor) => insertBlock(editor, KEYS.h1),
      },
      {
        icon: <Heading2Icon />,
        label: 'Heading 2',
        value: KEYS.h2,
        keywords: ['h2', 'subtitle'],
        onSelect: (editor) => insertBlock(editor, KEYS.h2),
      },
      {
        icon: <Heading3Icon />,
        label: 'Heading 3',
        value: KEYS.h3,
        keywords: ['h3'],
        onSelect: (editor) => insertBlock(editor, KEYS.h3),
      },
      {
        icon: <QuoteIcon />,
        label: 'Quote',
        value: KEYS.blockquote,
        keywords: ['blockquote', 'quote'],
        onSelect: (editor) => insertBlock(editor, KEYS.blockquote),
      },
      {
        icon: <MinusIcon />,
        label: 'Divider',
        value: KEYS.hr,
        keywords: ['hr', 'divider', 'line'],
        onSelect: (editor) => {
          editor.tf.insertNodes({ type: KEYS.hr, children: [{ text: '' }] } as TElement)
        },
      },
    ],
  },
  {
    group: 'Components',
    items: [
      {
        icon: <LayoutGridIcon />,
        label: 'Card',
        value: 'stdlib:Card',
        description: 'A simple card container',
        keywords: ['card', 'container', 'box'],
        onSelect: (editor) => insertStdlibComponent(editor, 'Card'),
      },
      {
        icon: <LayoutGridIcon />,
        label: 'Button',
        value: 'stdlib:Button',
        description: 'Interactive button',
        keywords: ['button', 'action', 'click'],
        onSelect: (editor) => insertStdlibComponent(editor, 'Button'),
      },
      {
        icon: <LayoutGridIcon />,
        label: 'MetricCard',
        value: 'stdlib:MetricCard',
        description: 'Display a metric value',
        keywords: ['metric', 'number', 'stat', 'kpi'],
        onSelect: (editor) => insertStdlibComponent(editor, 'MetricCard'),
      },
      {
        icon: <LayoutGridIcon />,
        label: 'DataTable',
        value: 'stdlib:DataTable',
        description: 'Tabular data display',
        keywords: ['table', 'data', 'grid'],
        onSelect: (editor) => insertStdlibComponent(editor, 'DataTable'),
      },
    ],
  },
]

export function SlashInputElement(props: PlateElementProps) {
  const { children, editor, element } = props

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
                  icon,
                  keywords,
                  label,
                  value,
                  onSelect,
                }) => (
                  <InlineComboboxItem
                    group={group}
                    key={value}
                    keywords={keywords}
                    label={label}
                    onClick={() => onSelect(editor)}
                    value={value}
                  >
                    {description ? (
                      <>
                        <div className="flex size-10 items-center justify-center rounded border border-border bg-background [&_svg]:size-5 [&_svg]:text-muted-foreground">
                          {icon}
                        </div>
                        <div className="ml-3 flex flex-1 flex-col truncate">
                          <span className="text-foreground">{label ?? value}</span>
                          <span className="truncate text-muted-foreground text-xs">
                            {description}
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="mr-2 text-muted-foreground">
                          {icon}
                        </div>
                        <span className="text-foreground">{label ?? value}</span>
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
  )
}
