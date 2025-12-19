'use client';

import {
  CaretDown,
  Code,
  Columns,
  TextHOne,
  TextHTwo,
  TextHThree,
  Lightbulb,
  List,
  ListNumbers,
  Paragraph,
  Quotes,
  Square,
} from '@phosphor-icons/react';
import { KEYS } from 'platejs';
import { useEditorRef, useSelectionFragmentProp } from 'platejs/react';
import * as React from 'react';

import {
  getBlockType,
  setBlockType,
} from '../transforms';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuPortal,
  type DropdownMenuProps,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  useOpenState,
} from './dropdown-menu';
import { ToolbarButton } from './toolbar';

export const turnIntoItems = [
  {
    icon: <Paragraph />,
    keywords: ['paragraph'],
    label: 'Text',
    value: KEYS.p,
  },
  {
    icon: <TextHOne />,
    keywords: ['title', 'h1'],
    label: 'Heading 1',
    value: KEYS.h1,
  },
  {
    icon: <TextHTwo />,
    keywords: ['subtitle', 'h2'],
    label: 'Heading 2',
    value: KEYS.h2,
  },
  {
    icon: <TextHThree />,
    keywords: ['subtitle', 'h3'],
    label: 'Heading 3',
    value: KEYS.h3,
  },
  {
    icon: <Square />,
    keywords: ['checklist', 'task', 'checkbox', '[]'],
    label: 'To-do list',
    value: KEYS.listTodo,
  },
  {
    icon: <List />,
    keywords: ['unordered', 'ul', '-'],
    label: 'Bulleted list',
    value: KEYS.ul,
  },
  {
    icon: <ListNumbers />,
    keywords: ['ordered', 'ol', '1'],
    label: 'Numbered list',
    value: KEYS.ol,
  },
  {
    icon: <CaretDown />,
    keywords: ['collapsible', 'expandable'],
    label: 'Toggle list',
    value: KEYS.toggle,
  },
  {
    icon: <Code />,
    keywords: ['```'],
    label: 'Code',
    value: KEYS.codeBlock,
  },
  {
    icon: <Quotes />,
    keywords: ['citation', 'blockquote', '>'],
    label: 'Quote',
    value: KEYS.blockquote,
  },
  {
    icon: <Lightbulb />,
    keywords: ['highlight', 'note', 'important'],
    label: 'Callout',
    value: KEYS.callout,
  },
  {
    icon: <Columns />,
    label: '3 columns',
    value: 'action_three_columns',
  },
];

export function TurnIntoToolbarButton(props: DropdownMenuProps) {
  const editor = useEditorRef();
  const openState = useOpenState();

  const value = useSelectionFragmentProp({
    defaultValue: KEYS.p,
    getProp: (node) => getBlockType(node as any),
  });
  const selectedItem = React.useMemo(
    () =>
      turnIntoItems.find((item) => item.value === (value ?? KEYS.p)) ??
      turnIntoItems[0],
    [value]
  );

  return (
    <DropdownMenu modal={false} {...openState} {...props}>
      <DropdownMenuTrigger asChild>
        <ToolbarButton isDropdown pressed={openState.open} tooltip="Turn into" className="w-[100px] justify-between">
          <span className="truncate">{selectedItem.label}</span>
        </ToolbarButton>
      </DropdownMenuTrigger>

      <DropdownMenuPortal>
        <DropdownMenuContent
          align="start"
          className="ignore-click-outside/toolbar min-w-0"
          data-plate-prevent-overlay
        >
          <DropdownMenuGroup>
            <DropdownMenuLabel>Turn into</DropdownMenuLabel>

            <DropdownMenuRadioGroup
              className="flex flex-col gap-0.5"
              onValueChange={(type) => {
                setBlockType(editor, type);
                editor.tf.focus();
              }}
              value={selectedItem.value}
            >
              {turnIntoItems.map(({ icon, label, value: itemValue }) => (
                <DropdownMenuRadioItem
                  className="min-w-[180px]"
                  key={itemValue}
                  value={itemValue}
                >
                  <div className="mr-2 flex size-5 items-center justify-center rounded-sm border border-foreground/15 bg-white p-0.5 text-subtle-foreground [&_svg]:size-3">
                    {icon}
                  </div>
                  {label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenu>
  );
}
