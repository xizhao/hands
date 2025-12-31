"use client";

import type { PlateElementProps } from "platejs/react";
import { PlateElement } from "platejs/react";

import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxGroup,
  InlineComboboxGroupLabel,
  InlineComboboxInput,
  InlineComboboxItem,
} from "./inline-combobox";
import { groups } from "./slash-menu-items";

export function SlashInputElement(props: PlateElementProps) {
  const { children, editor, element } = props;

  return (
    <PlateElement {...props} as="span">
      <InlineCombobox element={element} trigger="/">
        <InlineComboboxInput />

        <InlineComboboxContent variant="slash">
          <InlineComboboxEmpty>No results</InlineComboboxEmpty>

          {groups.map(({ group, items }) => (
            <InlineComboboxGroup key={group}>
              <InlineComboboxGroupLabel>{group}</InlineComboboxGroupLabel>
              {items.map(({ description, focusEditor, icon, keywords, label, value, onSelect }) => (
                <InlineComboboxItem
                  focusEditor={focusEditor}
                  group={group}
                  key={value}
                  keywords={keywords}
                  label={label}
                  onClick={() => onSelect(editor, value)}
                  value={value}
                >
                  {description ? (
                    <>
                      <div className="flex size-11 items-center justify-center rounded border border-foreground/15 bg-white [&_svg]:size-5 [&_svg]:text-subtle-foreground">
                        {icon}
                      </div>
                      <div className="ml-3 flex flex-1 flex-col truncate">
                        <span>{label ?? value}</span>
                        <span className="truncate text-muted-foreground text-xs">
                          {description}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="mr-2 text-subtle-foreground">{icon}</div>
                      {label ?? value}
                    </>
                  )}
                </InlineComboboxItem>
              ))}
            </InlineComboboxGroup>
          ))}
        </InlineComboboxContent>
      </InlineCombobox>

      {children}
    </PlateElement>
  );
}
