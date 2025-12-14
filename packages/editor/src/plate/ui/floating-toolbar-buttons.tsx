'use client';

import {
  Bold,
  Code2,
  Italic,
  Strikethrough,
  Underline,
} from 'lucide-react';
import { KEYS } from 'platejs';
import {
  useEditorReadOnly,
} from 'platejs/react';
import * as React from 'react';

import { MarkToolbarButton } from './mark-toolbar-button';
import { ToolbarGroup } from './toolbar';

export function FloatingToolbarButtons() {
  const readOnly = useEditorReadOnly();

  return (
    <div
      className="flex"
      style={{
        transform: 'translateX(calc(-1px))',
        whiteSpace: 'nowrap',
      }}
    >
      {!readOnly && (
        <>
          <ToolbarGroup>
            <MarkToolbarButton
              nodeType={KEYS.bold}
              shortcut="⌘+B"
              tooltip="Bold"
            >
              <Bold />
            </MarkToolbarButton>

            <MarkToolbarButton
              nodeType={KEYS.italic}
              shortcut="⌘+I"
              tooltip="Italic"
            >
              <Italic />
            </MarkToolbarButton>

            <MarkToolbarButton
              nodeType={KEYS.underline}
              shortcut="⌘+U"
              tooltip="Underline"
            >
              <Underline />
            </MarkToolbarButton>

            <MarkToolbarButton
              nodeType={KEYS.strikethrough}
              shortcut="⌘+Shift+X"
              tooltip="Strikethrough"
            >
              <Strikethrough />
            </MarkToolbarButton>

            <MarkToolbarButton
              nodeType={KEYS.code}
              shortcut="⌘+E"
              tooltip="Code"
            >
              <Code2 />
            </MarkToolbarButton>
          </ToolbarGroup>
        </>
      )}
    </div>
  );
}
