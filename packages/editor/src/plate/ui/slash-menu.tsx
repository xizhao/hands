/**
 * Slash Menu - Command menu for inserting blocks
 * Dynamically loads components from stdlib registry
 */

import * as icons from 'lucide-react'
import {
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ListIcon,
  ListOrderedIcon,
  MinusIcon,
  PilcrowIcon,
  QuoteIcon,
  CodeIcon,
  ImageIcon,
  TableIcon,
  SquareCheckIcon,
  ChevronDownIcon,
  type LucideIcon,
} from 'lucide-react'
import { KEYS, type TElement } from 'platejs'
import type { PlateEditor, PlateElementProps } from 'platejs/react'
import { PlateElement } from 'platejs/react'
import * as React from 'react'
import { useMemo } from 'react'

import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxGroup,
  InlineComboboxGroupLabel,
  InlineComboboxInput,
  InlineComboboxItem,
} from './inline-combobox'

// Import stdlib registry
import {
  listComponents,
  listCategories,
  type ComponentMeta,
} from '@hands/stdlib/registry'

// All components go through RSC now - no local component registry needed

type SlashMenuItem = {
  icon: React.ReactNode
  value: string
  onSelect: (editor: PlateEditor) => void
  description?: string
  keywords?: string[]
  label?: string
}

type Group = {
  group: string
  items: SlashMenuItem[]
}

function insertBlock(editor: PlateEditor, type: string) {
  editor.tf.setNodes({ type } as Partial<TElement>)
}

function insertStdlibComponent(editor: PlateEditor, componentName: string, isVoid: boolean = false) {
  const node: TElement = {
    type: componentName,
    children: isVoid ? [{ text: '' }] : [{ type: 'p', children: [{ text: '' }] }],
    ...(isVoid ? { isVoid: true } : {}),
  }
  editor.tf.insertNodes(node)
}

/**
 * Get a Lucide icon by name (kebab-case or PascalCase)
 */
function getIcon(iconName?: string): React.ReactNode {
  if (!iconName) return <PilcrowIcon />

  // Convert kebab-case to PascalCase for Lucide
  const pascalCase = iconName
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('') + 'Icon'

  const IconComponent = (icons as any)[pascalCase]
  if (IconComponent) {
    return <IconComponent />
  }

  // Fallback
  return <PilcrowIcon />
}

/**
 * Build slash menu groups from stdlib registry
 */
function buildGroupsFromRegistry(): Group[] {
  const groups: Group[] = []
  const categories = listCategories()
  const allComponents = listComponents()

  // Group components by category
  const componentsByCategory = new Map<string, Array<{ key: string } & ComponentMeta>>()

  for (const comp of allComponents) {
    const catKey = comp.category
    if (!componentsByCategory.has(catKey)) {
      componentsByCategory.set(catKey, [])
    }
    componentsByCategory.get(catKey)!.push(comp)
  }

  // Define category order and which categories to show
  const categoryOrder = [
    'blocks',
    'data',
    'charts',
    'ui-layout',
    'ui-input',
    'ui-display',
    'ui-feedback',
    'ui-overlay',
    'ui-navigation',
    'media',
    'inline',
    'layout',
  ]

  // Process categories in order
  for (const catKey of categoryOrder) {
    const catMeta = categories.find(c => c.key === catKey)
    if (!catMeta) continue

    const components = componentsByCategory.get(catKey) || []
    if (components.length === 0) continue

    const items: SlashMenuItem[] = []

    for (const comp of components) {
      // Check if this is a "native" plate block (has plateKey) or a component (has files)
      if (comp.plateKey) {
        // Native Plate block type
        items.push({
          icon: getIcon(comp.icon),
          label: comp.name,
          value: `plate:${comp.plateKey}`,
          description: comp.description,
          keywords: comp.keywords || [],
          onSelect: (editor) => insertBlock(editor, comp.plateKey!),
        })
      } else if (comp.files && comp.files.length > 0) {
        // Stdlib component - will be rendered via RSC
        // Determine if component is void (self-closing, no children)
        // Components like MetricCard, charts are void; Card, Button are not
        const voidComponents = new Set(['MetricCard', 'DataTable', 'BarChart', 'LineChart', 'Avatar', 'Badge', 'Progress', 'Skeleton', 'Spinner', 'Separator', 'Input', 'Textarea', 'Checkbox', 'Switch', 'Slider', 'Calendar'])
        const isVoid = voidComponents.has(comp.name)

        items.push({
          icon: getIcon(comp.icon),
          label: comp.name,
          value: `stdlib:${comp.name}`,
          description: comp.description,
          keywords: comp.keywords || [],
          onSelect: (editor) => insertStdlibComponent(editor, comp.name, isVoid),
        })
      }
    }

    if (items.length > 0) {
      groups.push({
        group: catMeta.name,
        items,
      })
    }
  }

  return groups
}

export function SlashInputElement(props: PlateElementProps) {
  const { children, editor, element } = props

  // Build groups from registry (memoized)
  const groups = useMemo(() => buildGroupsFromRegistry(), [])

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
                        <div className="flex size-8 shrink-0 items-center justify-center rounded border border-border bg-background [&_svg]:size-4 [&_svg]:text-muted-foreground">
                          {icon}
                        </div>
                        <div className="ml-2 flex flex-1 flex-col truncate">
                          <span className="text-foreground text-sm">{label ?? value}</span>
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
