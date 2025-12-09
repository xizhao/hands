'use client';

import * as React from 'react';
import {
  Combobox,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxItem,
  ComboboxPopover,
  ComboboxProvider,
  useComboboxContext,
  useComboboxStore,
} from '@ariakit/react/combobox';
import { Portal } from '@ariakit/react/portal';
import { filterWords } from '@platejs/combobox';
import { useComboboxInput, useHTMLInputCursorState } from '@platejs/combobox/react';
import { useEditorRef } from 'platejs/react';
import { cn } from '@/lib/utils';

// Context for sharing combobox state
interface InlineComboboxContextValue {
  filter: (value: string) => boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  removeInput: () => void;
  showTrigger: boolean;
  trigger: string;
}

const InlineComboboxContext = React.createContext<InlineComboboxContextValue>(null as any);

// InlineCombobox root
interface InlineComboboxProps {
  children: React.ReactNode;
  element: any;
  trigger: string;
}

export function InlineCombobox({ children, element, trigger }: InlineComboboxProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const cursorState = useHTMLInputCursorState(inputRef);

  const { removeInput } = useComboboxInput({
    ref: inputRef,
    cursorState,
  });

  const [showTrigger, setShowTrigger] = React.useState(true);

  // Get search text from element
  const text = element?.children?.[0]?.text ?? '';

  const filter = React.useCallback(
    (value: string) => filterWords(text, value),
    [text]
  );

  const contextValue: InlineComboboxContextValue = React.useMemo(
    () => ({
      filter,
      inputRef,
      removeInput,
      showTrigger,
      trigger,
    }),
    [filter, inputRef, removeInput, showTrigger, trigger]
  );

  const store = useComboboxStore({
    setValue: (newValue) => {
      setShowTrigger(!newValue);
    },
  });

  return (
    <ComboboxProvider
      open
      setValue={(value) => {
        setShowTrigger(!value);
      }}
      store={store}
    >
      <InlineComboboxContext.Provider value={contextValue}>
        {children}
      </InlineComboboxContext.Provider>
    </ComboboxProvider>
  );
}

// InlineComboboxInput
export function InlineComboboxInput({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Combobox>) {
  const { inputRef, showTrigger, trigger } = React.useContext(InlineComboboxContext);
  const cursorState = useHTMLInputCursorState(inputRef);

  const { props: inputProps } = useComboboxInput({
    ref: inputRef,
    cursorState,
  });

  return (
    <span className={cn('inline-block', className)} {...props}>
      {showTrigger && trigger}
      <Combobox
        {...inputProps}
        autoSelect
        ref={inputRef}
        className="m-0 border-none bg-transparent p-0 outline-none"
        style={{
          caretColor: 'var(--foreground)',
          fontSize: 'inherit',
          fontWeight: 'inherit',
        }}
      />
    </span>
  );
}

// InlineComboboxContent
interface InlineComboboxContentProps
  extends React.ComponentPropsWithoutRef<typeof ComboboxPopover> {
  children: React.ReactNode;
}

export function InlineComboboxContent({
  children,
  className,
  ...props
}: InlineComboboxContentProps) {
  return (
    <Portal>
      <ComboboxPopover
        className={cn(
          'z-50 max-h-[288px] w-[300px] overflow-y-auto rounded-md border bg-popover p-1 shadow-md',
          className
        )}
        {...props}
      >
        {children}
      </ComboboxPopover>
    </Portal>
  );
}

// InlineComboboxEmpty
interface InlineComboboxEmptyProps {
  children: React.ReactNode;
}

export function InlineComboboxEmpty({ children }: InlineComboboxEmptyProps) {
  const context = useComboboxContext();
  const items = context?.useState('items') ?? [];

  if (items.length > 0) return null;

  return (
    <div className="py-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

// InlineComboboxGroup
interface InlineComboboxGroupProps
  extends React.ComponentPropsWithoutRef<typeof ComboboxGroup> {
  children: React.ReactNode;
}

export function InlineComboboxGroup({
  children,
  className,
  ...props
}: InlineComboboxGroupProps) {
  return (
    <ComboboxGroup className={cn('py-1', className)} {...props}>
      {children}
    </ComboboxGroup>
  );
}

// InlineComboboxGroupLabel
interface InlineComboboxGroupLabelProps
  extends React.ComponentPropsWithoutRef<typeof ComboboxGroupLabel> {
  children: React.ReactNode;
}

export function InlineComboboxGroupLabel({
  children,
  className,
  ...props
}: InlineComboboxGroupLabelProps) {
  return (
    <ComboboxGroupLabel
      className={cn(
        'px-2 py-1.5 text-xs font-medium text-muted-foreground',
        className
      )}
      {...props}
    >
      {children}
    </ComboboxGroupLabel>
  );
}

// InlineComboboxItem
interface InlineComboboxItemProps
  extends Omit<React.ComponentPropsWithoutRef<typeof ComboboxItem>, 'value'> {
  focusEditor?: boolean;
  group?: string;
  keywords?: string[];
  label?: string;
  value: string;
}

export function InlineComboboxItem({
  className,
  focusEditor,
  group,
  keywords,
  label,
  value,
  ...props
}: InlineComboboxItemProps) {
  const { filter, removeInput } = React.useContext(InlineComboboxContext);
  const editor = useEditorRef();

  // Check if this item matches the filter
  const matchesFilter = filter(value) || (keywords?.some(filter) ?? false) || (label ? filter(label) : false);

  if (!matchesFilter) return null;

  return (
    <ComboboxItem
      className={cn(
        'relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none',
        'data-[active-item]:bg-accent data-[active-item]:text-accent-foreground',
        className
      )}
      value={value}
      setValueOnClick={false}
      onClick={(e) => {
        removeInput();
        props.onClick?.(e);
        if (focusEditor) {
          editor.tf.focus();
        }
      }}
      {...props}
    />
  );
}
