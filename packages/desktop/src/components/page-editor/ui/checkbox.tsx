'use client';

import { Check, Square } from '@phosphor-icons/react';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import * as React from 'react';

import { cn } from '@/lib/utils';

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        'group peer flex size-4 shrink-0 items-center justify-center rounded-sm border border-primary bg-primary ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=unchecked]:bg-background data-[state=checked]:text-primary-foreground data-[state=indeterminate]:text-primary-foreground',
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        className={cn('flex items-center justify-center text-current')}
      >
        <Check className="inset-0 size-0 group-data-[state=checked]:size-4" weight="bold" />
        <Square className="size-0 group-data-[state=indeterminate]:size-4" weight="fill" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
