'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Toolbar } from './toolbar';

export interface FixedToolbarProps extends React.ComponentProps<typeof Toolbar> {
  children?: React.ReactNode;
}

/**
 * Google Docs-style fixed toolbar that sits at the top of the editor.
 * Always visible, no floating/selection-based behavior.
 */
export function FixedToolbar({
  children,
  className,
  ...props
}: FixedToolbarProps) {
  return (
    <Toolbar
      className={cn(
        'sticky top-0 z-50',
        'w-full',
        'border-b border-border/50',
        'bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80',
        'px-4 py-1.5',
        'flex items-center gap-1',
        'overflow-x-auto scrollbar-hide',
        className
      )}
      {...props}
    >
      {children}
    </Toolbar>
  );
}
