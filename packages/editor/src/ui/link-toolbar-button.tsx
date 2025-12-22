'use client';

import { Link } from '@phosphor-icons/react';
import { useEditorPlugin, useEditorSelection } from 'platejs/react';
import { RangeApi } from 'platejs';
import * as React from 'react';

import { linkPlugin } from '../plugins/link-kit';

import { ToolbarButton } from './toolbar';

export function LinkToolbarButton(
  props: React.ComponentProps<typeof ToolbarButton>
) {
  const { api } = useEditorPlugin(linkPlugin);
  const selection = useEditorSelection();

  // Disable when no selection or selection is collapsed
  const isDisabled = !selection || RangeApi.isCollapsed(selection);

  return (
    <ToolbarButton
      data-plate-focus
      disabled={isDisabled}
      onClick={() => api.a.show()}
      tooltip="Link"
      {...props}
    >
      <Link />
    </ToolbarButton>
  );
}
