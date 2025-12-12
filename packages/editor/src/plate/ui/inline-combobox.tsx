/**
 * Inline Combobox for slash menu
 * Simplified from desktop version
 */

import { filterWords } from '@platejs/combobox'
import {
  type UseComboboxInputResult,
  useComboboxInput,
  useHTMLInputCursorState,
} from '@platejs/combobox/react'
import { cva, type VariantProps } from 'class-variance-authority'
import type { Point, TElement } from 'platejs'
import { useComposedRef, useEditorRef } from 'platejs/react'
import type { HTMLAttributes, ReactNode, RefObject } from 'react'
import * as React from 'react'
import { useEffect } from 'react'
import { cn } from '../../lib/utils'

// Simple Ariakit-like components using native elements
// For demo purposes - in production, use @ariakit/react

type FilterFn = (
  item: { value: string; group?: string; keywords?: string[]; label?: string },
  search: string
) => boolean

type InlineComboboxContextValue = {
  filter: FilterFn | false
  inputProps: UseComboboxInputResult['props']
  inputRef: RefObject<HTMLInputElement | null>
  removeInput: UseComboboxInputResult['removeInput']
  showTrigger: boolean
  trigger: string
  setHasEmpty: (hasEmpty: boolean) => void
  searchValue: string
  setSearchValue: (value: string) => void
}

const InlineComboboxContext = React.createContext<InlineComboboxContextValue>(
  null as any
)

const defaultFilter: FilterFn = (
  { group, keywords = [], label, value },
  search
) => {
  const uniqueTerms = new Set(
    [value, ...keywords, group, label].filter(Boolean)
  )
  return Array.from(uniqueTerms).some((keyword) =>
    filterWords(keyword!, search)
  )
}

type InlineComboboxProps = {
  children: ReactNode
  element: TElement
  trigger: string
  filter?: FilterFn | false
  hideWhenNoValue?: boolean
  showTrigger?: boolean
}

function InlineCombobox({
  children,
  element,
  filter = defaultFilter,
  hideWhenNoValue = false,
  showTrigger = true,
  trigger,
}: InlineComboboxProps) {
  const editor = useEditorRef()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const cursorState = useHTMLInputCursorState(inputRef)
  const [searchValue, setSearchValue] = React.useState('')
  const [hasEmpty, setHasEmpty] = React.useState(false)
  const [isOpen, setIsOpen] = React.useState(true)

  const insertPoint = React.useRef<Point | null>(null)

  useEffect(() => {
    const path = editor.api.findPath(element)
    if (!path) return

    const point = editor.api.before(path)
    if (!point) return

    const pointRef = editor.api.pointRef(point)
    insertPoint.current = pointRef.current

    return () => {
      pointRef.unref()
    }
  }, [editor, element])

  const { props: inputProps, removeInput } = useComboboxInput({
    cancelInputOnBlur: false,
    cursorState,
    ref: inputRef,
    onCancelInput: (cause) => {
      if (cause !== 'backspace') {
        editor.tf.insertText(trigger + searchValue, {
          at: insertPoint?.current ?? undefined,
        })
      }
      if (cause === 'arrowLeft' || cause === 'arrowRight') {
        editor.tf.move({
          distance: 1,
          reverse: cause === 'arrowLeft',
        })
      }
    },
  })

  const contextValue: InlineComboboxContextValue = React.useMemo(
    () => ({
      filter,
      inputProps,
      inputRef,
      removeInput,
      setHasEmpty,
      showTrigger,
      trigger,
      searchValue,
      setSearchValue,
    }),
    [
      trigger,
      showTrigger,
      filter,
      inputRef,
      inputProps,
      removeInput,
      setHasEmpty,
      searchValue,
    ]
  )

  return (
    <span contentEditable={false}>
      <InlineComboboxContext.Provider value={contextValue}>
        {children}
      </InlineComboboxContext.Provider>
    </span>
  )
}

function InlineComboboxInput({
  className,
  ref: refProp,
  ...props
}: React.ComponentProps<'input'>) {
  const {
    inputProps,
    inputRef: contextRef,
    showTrigger,
    trigger,
    searchValue,
    setSearchValue,
  } = React.useContext(InlineComboboxContext)

  const ref = useComposedRef(refProp, contextRef)

  return (
    <>
      {showTrigger && trigger}

      <span className="relative min-h-[1lh]">
        <span
          aria-hidden="true"
          className="invisible overflow-hidden text-nowrap"
        >
          {searchValue || props.placeholder || '\u200B'}
        </span>

        <input
          autoFocus
          className={cn(
            'absolute top-0 left-0 size-full bg-transparent outline-none',
            className
          )}
          ref={ref}
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          {...inputProps}
          {...props}
        />
      </span>
    </>
  )
}

const comboboxVariants = cva(
  'z-[500] mt-1 min-w-[180px] max-w-[calc(100vw-24px)] overflow-y-auto overflow-x-hidden rounded-lg bg-popover shadow-lg border border-border',
  {
    defaultVariants: {
      variant: 'default',
    },
    variants: {
      variant: {
        default: 'max-h-[40vh]',
        slash: 'w-[340px] max-h-[60vh]',
      },
    },
  }
)

function InlineComboboxContent({
  className,
  variant,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof comboboxVariants>) {
  return (
    <div
      className={cn(comboboxVariants({ variant }), className)}
      style={{ position: 'absolute', top: '100%', left: 0 }}
      {...props}
    >
      {props.children}
    </div>
  )
}

const comboboxItemVariants = cva(
  'relative mx-1 flex select-none items-center rounded-sm px-2 py-1.5 text-foreground text-sm outline-none transition-colors [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    defaultVariants: {
      interactive: true,
    },
    variants: {
      interactive: {
        false: '',
        true: 'cursor-pointer hover:bg-accent hover:text-accent-foreground data-[active=true]:bg-accent',
      },
    },
  }
)

function InlineComboboxItem({
  className,
  focusEditor = true,
  group,
  keywords,
  label,
  onClick,
  value,
  ...props
}: {
  focusEditor?: boolean
  group?: string
  keywords?: string[]
  label?: string
  value: string
} & React.ComponentProps<'div'>) {
  const { filter, removeInput, searchValue } = React.useContext(InlineComboboxContext)

  const visible = React.useMemo(
    () => !filter || filter({ group, keywords, label, value }, searchValue),
    [filter, group, keywords, value, label, searchValue]
  )

  if (!visible) return null

  return (
    <div
      className={cn(comboboxItemVariants(), className)}
      onClick={(event) => {
        removeInput(focusEditor)
        onClick?.(event)
      }}
      role="option"
      {...props}
    />
  )
}

function InlineComboboxEmpty({
  children,
  className,
}: HTMLAttributes<HTMLDivElement>) {
  const { setHasEmpty, searchValue } = React.useContext(InlineComboboxContext)

  useEffect(() => {
    setHasEmpty(true)
    return () => {
      setHasEmpty(false)
    }
  }, [setHasEmpty])

  // Show empty state only when there's a search but no results
  // This is a simplified version - in production check if items are filtered
  if (!searchValue) return null

  return (
    <div
      className={cn(
        comboboxItemVariants({ interactive: false }),
        'my-1.5 text-muted-foreground',
        className
      )}
    >
      {children}
    </div>
  )
}

function InlineComboboxGroup({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'border-b border-border last:border-0 py-1.5',
        className
      )}
      role="group"
      {...props}
    />
  )
}

function InlineComboboxGroupLabel({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'mt-1.5 mb-2 px-3 font-medium text-muted-foreground text-xs',
        className
      )}
      {...props}
    />
  )
}

export {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxGroup,
  InlineComboboxGroupLabel,
  InlineComboboxInput,
  InlineComboboxItem,
}
