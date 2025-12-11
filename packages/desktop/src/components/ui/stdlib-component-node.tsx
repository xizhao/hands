'use client';

/**
 * Stdlib Component Node - Renders React components from @hands/stdlib
 *
 * This is a Plate element renderer that displays stdlib components
 * with selection overlay and props editing capabilities.
 */

import { useState, useCallback, useMemo } from 'react';
import { PlateElement, type PlateElementProps, useEditorRef } from 'platejs/react';
import { cn } from '@/lib/utils';
import { getStdlibComponent, getDefaultProps } from '@/components/BlockEditor/component-map';
import type { StdlibComponentElement } from '@/components/editor/plate-types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  DotsThree,
  Trash,
  Copy,
  GearSix,
  WarningCircle,
} from '@phosphor-icons/react';
import { STDLIB_COMPONENT_KEY } from '@/components/editor/plugins/stdlib-component-kit';

interface StdlibComponentNodeProps extends PlateElementProps {
  element: StdlibComponentElement;
}

/**
 * Placeholder shown when component can't be found
 */
function ComponentNotFound({ componentName }: { componentName: string }) {
  return (
    <div className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-destructive/10 border border-destructive/20">
      <WarningCircle className="h-4 w-4 text-destructive" weight="fill" />
      <span className="text-destructive text-sm">
        Component not found: <code className="font-mono">{componentName}</code>
      </span>
    </div>
  );
}

/**
 * Placeholder shown when component has no props
 */
function EmptyComponentPlaceholder({ componentName }: { componentName: string }) {
  return (
    <div className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50 border border-dashed border-border">
      <span className="text-muted-foreground text-sm">
        <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">{componentName}</code>
        <span className="ml-2 text-xs">Click to configure</span>
      </span>
    </div>
  );
}

export function StdlibComponentNode(props: PlateElementProps) {
  const { element, children } = props;
  const stdlibElement = element as StdlibComponentElement;
  const { componentName, props: componentProps } = stdlibElement;

  const editor = useEditorRef();
  const [isHovered, setIsHovered] = useState(false);
  const [isSelected, setIsSelected] = useState(false);
  const [showPropsPanel, setShowPropsPanel] = useState(false);

  // Get the React component from the map
  const Component = useMemo(() => getStdlibComponent(componentName), [componentName]);

  // Merge default props with element props
  const mergedProps = useMemo(() => {
    const defaults = getDefaultProps(componentName);
    return { ...defaults, ...componentProps };
  }, [componentName, componentProps]);

  // Handle delete
  const handleDelete = useCallback(() => {
    const path = editor.api.findPath(element);
    if (path) {
      editor.tf.removeNodes({ at: path });
    }
  }, [editor, element]);

  // Handle duplicate
  const handleDuplicate = useCallback(() => {
    const path = editor.api.findPath(element);
    if (path) {
      const newElement: StdlibComponentElement = {
        ...stdlibElement,
        id: undefined, // Let Plate assign new ID
      };
      editor.tf.insertNodes(newElement, {
        at: [path[0] + 1],
      });
    }
  }, [editor, element, stdlibElement]);

  // Handle props update
  const handlePropsChange = useCallback((newProps: Record<string, unknown>) => {
    const path = editor.api.findPath(element);
    if (path) {
      editor.tf.setNodes(
        { props: newProps } as Partial<StdlibComponentElement>,
        { at: path }
      );
    }
  }, [editor, element]);

  // Toggle props panel
  const handleEditProps = useCallback(() => {
    setShowPropsPanel((prev) => !prev);
  }, []);

  return (
    <PlateElement
      {...props}
      className={cn(
        'my-2 relative',
        isSelected && 'ring-2 ring-primary/50 rounded-lg'
      )}
    >
      <div
        contentEditable={false}
        className={cn(
          'relative rounded-lg transition-all duration-150',
          isHovered && !isSelected && 'ring-1 ring-border/50'
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={() => setIsSelected(true)}
        onBlur={() => setIsSelected(false)}
      >
        {/* Component menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                'absolute -right-2 -top-2 z-10 p-1 rounded-md',
                'bg-background/90 backdrop-blur-sm border border-border/50 shadow-sm',
                'hover:bg-muted transition-all duration-150',
                isHovered || isSelected ? 'opacity-100' : 'opacity-0'
              )}
            >
              <DotsThree weight="bold" className="h-4 w-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[160px]">
            <DropdownMenuItem onClick={handleEditProps} className="text-xs">
              <GearSix className="h-3.5 w-3.5 mr-2" />
              Edit Props
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleDuplicate} className="text-xs">
              <Copy className="h-3.5 w-3.5 mr-2" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleDelete}
              className="text-xs text-destructive focus:text-destructive"
            >
              <Trash className="h-3.5 w-3.5 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Component type badge */}
        <div
          className={cn(
            'absolute -left-2 -top-2 z-10 px-1.5 py-0.5 rounded-md',
            'bg-background/90 backdrop-blur-sm border border-border/50 shadow-sm',
            'text-[10px] font-medium text-muted-foreground',
            isHovered || isSelected ? 'opacity-100' : 'opacity-0',
            'transition-all duration-150'
          )}
        >
          {componentName}
        </div>

        {/* Render the actual component */}
        <div className="p-1">
          {!Component ? (
            <ComponentNotFound componentName={componentName} />
          ) : Object.keys(mergedProps).length === 0 ? (
            <EmptyComponentPlaceholder componentName={componentName} />
          ) : (
            <Component {...mergedProps} />
          )}
        </div>

        {/* Props panel (inline popover) */}
        {showPropsPanel && (
          <div
            className={cn(
              'absolute top-full left-0 z-20 mt-2',
              'min-w-[280px] p-4 rounded-lg',
              'bg-popover border border-border shadow-lg'
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium">{componentName} Props</h4>
              <button
                onClick={() => setShowPropsPanel(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <span className="sr-only">Close</span>
                ×
              </button>
            </div>
            <div className="space-y-3 text-sm">
              {Object.entries(mergedProps).map(([key, value]) => (
                <div key={key} className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    {key}
                  </label>
                  <input
                    type="text"
                    value={typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')}
                    onChange={(e) => {
                      let newValue: unknown = e.target.value;
                      // Try to parse as JSON for objects/arrays
                      if (typeof value === 'object') {
                        try {
                          newValue = JSON.parse(e.target.value);
                        } catch {
                          newValue = e.target.value;
                        }
                      } else if (typeof value === 'number') {
                        newValue = Number(e.target.value) || 0;
                      } else if (typeof value === 'boolean') {
                        newValue = e.target.value === 'true';
                      }
                      handlePropsChange({ ...mergedProps, [key]: newValue });
                    }}
                    className={cn(
                      'w-full px-2 py-1.5 rounded-md text-sm',
                      'bg-background border border-input',
                      'focus:outline-none focus:ring-1 focus:ring-ring'
                    )}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {children}
    </PlateElement>
  );
}
