'use client';

import { DatePlugin } from '@platejs/date/react';
import { MentionPlugin } from '@platejs/mention/react';
import { ArrowUpRightIcon, FileTextIcon } from 'lucide-react';
import { IS_APPLE } from 'platejs';
import {
  PlateElement,
  type PlateElementProps,
  useEditorRef,
  useFocused,
  useHotkeys,
  useReadOnly,
  useSelected,
} from 'platejs/react';
import React, { useEffect, useMemo, useState } from 'react';
import { useMounted } from 'react-tweet';
import { cn } from '@/lib/utils';
import type { MyMentionElement } from '@/components/editor/plate-types';
import { insertInlineElement } from '@/components/editor/transforms';
import { useDebounce } from '@/hooks/ui';

import { Avatar, AvatarFallback, AvatarImage } from './avatar';
import { HoverCard, HoverCardContent, HoverCardTrigger } from './hover-card';
import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxGroup,
  InlineComboboxGroupLabel,
  InlineComboboxInput,
  InlineComboboxItem,
} from './inline-combobox';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './tooltip';

type DocumentItem = {
  id: string;
  icon: string;
  title: string;
};

type PeopleComboboxGroupProps = {
  search: string;
  onUserHover: (name: string) => void;
  onUserSelect: (user: UserItem) => void;
};

export const mockMentionDocuments = [
  { id: 'docs/examples/ai', icon: '📋', title: 'AI' },
  { id: 'docs/examples/callout', icon: '🧰', title: 'Callout' },
  { id: 'docs/examples/equation', icon: '🧮', title: 'Equation' },
  { id: 'docs/examples/toc', icon: '📚', title: 'Table of Contents' },
];

type UserItem = {
  id: string;
  email: string;
  name: string;
  image: string;
};

const mockUsers = [
  { id: '1', email: 'john@example.com', name: 'John Doe', image: 'https://api.dicebear.com/7.x/avataaars/svg?seed=John' },
  { id: '2', email: 'jane@example.com', name: 'Jane Smith', image: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Jane' },
  { id: '3', email: 'bob@example.com', name: 'Bob Wilson', image: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Bob' },
];

export function MentionInputElement(props: PlateElementProps) {
  const [placeholder, setPlaceholder] = useState('Mention a person, page, or date...');
  const { children, editor, element } = props;
  const [search, setSearch] = React.useState('');

  return (
    <PlateElement {...props} as="span">
      <InlineCombobox
        element={element}
        setValue={setSearch}
        showTrigger={false}
        trigger="@"
        value={search}
      >
        <span className="rounded-md bg-muted px-1.5 py-0.5 align-baseline text-sm ring-ring">
          <span className="font-bold">@</span>
          <InlineComboboxInput className="min-w-[100px]" placeholder={placeholder} />
        </span>

        <InlineComboboxContent variant="mention">
          <InlineComboboxEmpty>No results found</InlineComboboxEmpty>

          <InlineComboboxGroup>
            <InlineComboboxGroupLabel>Date</InlineComboboxGroupLabel>
            <InlineComboboxItem
              onClick={() => insertInlineElement(editor, DatePlugin.key)}
              onFocus={() => setPlaceholder('Today')}
              onMouseEnter={() => setPlaceholder('Today')}
              value="today"
            >
              <span>Today</span>
              <span className="mx-1 text-muted-foreground">—</span>
              <span className="font-medium text-muted-foreground text-xs">
                {new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
            </InlineComboboxItem>
          </InlineComboboxGroup>

          <DocumentComboboxGroup
            onDocumentHover={(name) => setPlaceholder(name)}
            onDocumentSelect={(document) => {
              editor.tf.insertNodes<MyMentionElement>({
                key: `/${document.id}`,
                children: [{ text: '' }],
                icon: document.icon ?? undefined,
                type: MentionPlugin.key,
                value: document.title!,
              });
              editor.tf.move({ unit: 'offset' });
            }}
            search={search}
          />

          <PeopleComboboxGroup
            onUserHover={(name) => setPlaceholder(name)}
            onUserSelect={(user) => {
              editor.tf.insertNodes<MyMentionElement>({
                key: user.id,
                children: [{ text: '' }],
                type: MentionPlugin.key,
                value: user.name ?? user.email!,
              });
              editor.tf.move({ unit: 'offset' });
            }}
            search={search}
          />
        </InlineComboboxContent>
      </InlineCombobox>
      {children}
    </PlateElement>
  );
}

type DocumentComboboxGroupProps = {
  search: string;
  onDocumentHover: (title: string) => void;
  onDocumentSelect: (document: DocumentItem) => void;
};

function PeopleComboboxGroup({ search: searchRaw, onUserHover, onUserSelect }: PeopleComboboxGroupProps) {
  const search = useDebounce(searchRaw, 100);
  const allUsers = useMemo(
    () => mockUsers.filter((user) =>
      user.name?.toLowerCase().includes(search.toLowerCase()) ||
      user.email?.toLowerCase().includes(search.toLowerCase())
    ),
    [search]
  );

  if (allUsers.length === 0) return null;

  return (
    <InlineComboboxGroup>
      <InlineComboboxGroupLabel>People</InlineComboboxGroupLabel>
      {allUsers.map((user) => (
        <InlineComboboxItem
          key={user.id}
          onClick={() => onUserSelect(user as UserItem)}
          onFocus={() => onUserHover(user.name ?? user.email!)}
          onMouseEnter={() => onUserHover(user.name ?? user.email!)}
          value={user.name ?? user.email!}
        >
          <Avatar className="mr-2.5 size-5">
            <AvatarImage alt={user.name!} src={user.image!} />
            <AvatarFallback>{user.name?.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
          {user.name ?? user.email}
        </InlineComboboxItem>
      ))}
    </InlineComboboxGroup>
  );
}

function DocumentComboboxGroup({ search: searchRaw, onDocumentHover, onDocumentSelect }: DocumentComboboxGroupProps) {
  const search = useDebounce(searchRaw, 500);
  const allDocuments = useMemo(
    () => mockMentionDocuments.filter((doc) => doc.title.toLowerCase().includes(search.toLowerCase())),
    [search]
  );

  if (allDocuments.length === 0) return null;

  return (
    <InlineComboboxGroup>
      <InlineComboboxGroupLabel>Link to page</InlineComboboxGroupLabel>
      {allDocuments.map((document) => (
        <InlineComboboxItem
          key={document.id}
          onClick={() => onDocumentSelect(document as DocumentItem)}
          onFocus={() => onDocumentHover(document.title ?? '')}
          onMouseEnter={() => onDocumentHover(document.title ?? '')}
          value={document.title || 'Untitled Document'}
        >
          <span className="mr-2 size-5">{document.icon ?? <FileTextIcon />}</span>
          {document.title ?? 'Untitled Document'}
        </InlineComboboxItem>
      ))}
    </InlineComboboxGroup>
  );
}

const openDocument = (id: string) => {
  window.open(`${window.location.origin}/${id}`, '_self');
};

function DocumentMentionElement(props: PlateElementProps<MyMentionElement> & { prefix?: string }) {
  const { children } = props;
  const element = props.element;
  const selected = useSelected();
  const focused = useFocused();

  useHotkeys('enter', () => {
    if (selected && focused) openDocument(element.key!.slice(1));
  }, { enabled: selected && focused, enableOnContentEditable: true, enableOnFormTags: true });

  return (
    <TooltipProvider>
      <Tooltip open={selected && focused}>
        <HoverCard closeDelay={0} openDelay={0}>
          <HoverCardTrigger contentEditable={false}>
            <TooltipTrigger contentEditable={false}>
              <PlateElement
                {...props}
                attributes={{
                  ...props.attributes,
                  contentEditable: false,
                  'data-slate-value': element.value,
                  draggable: true,
                  onClick: () => openDocument(element.key!.slice(1)),
                  onMouseDown: (e) => e.preventDefault(),
                }}
                className={cn(
                  'inline-block cursor-pointer rounded px-0.5 hover:bg-muted',
                  selected && focused && 'bg-brand/25'
                )}
              >
                {props.prefix}
                <span className="relative mr-3 inline-block">
                  {element.icon}
                  <ArrowUpRightIcon className="-right-3 absolute bottom-0 size-3.5 font-bold" />
                </span>
                <span className="border-b-1 font-medium">{element.value}</span>
                {children}
              </PlateElement>
            </TooltipTrigger>
            <TooltipContent>
              <p><span className="mr-1">Open Page</span><kbd>↵</kbd></p>
            </TooltipContent>
          </HoverCardTrigger>
          <HoverCardContent className="p-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{element.icon}</span>
              <span className="font-medium">{element.value}</span>
            </div>
          </HoverCardContent>
        </HoverCard>
      </Tooltip>
    </TooltipProvider>
  );
}

function UserMentionElement(props: PlateElementProps<MyMentionElement> & { prefix?: string }) {
  const { children } = props;
  const element = props.element;
  const readOnly = useReadOnly();
  const mounted = useMounted();

  return (
    <PlateElement
      {...props}
      attributes={{
        ...props.attributes,
        contentEditable: false,
        'data-slate-value': element.value,
        draggable: true,
      }}
      className={cn(
        'inline-block cursor-pointer align-baseline font-medium text-primary/65',
        !readOnly && 'cursor-pointer',
        (element.children[0] as any).bold === true && 'font-bold',
        (element.children[0] as any).italic === true && 'italic',
        (element.children[0] as any).underline === true && 'underline'
      )}
    >
      <span className="font-semibold text-primary/45">@</span>
      {mounted && IS_APPLE ? (
        <>{children}{props.prefix}{element.value}</>
      ) : (
        <>{props.prefix}{element.value}{children}</>
      )}
    </PlateElement>
  );
}

export function MentionElement(props: PlateElementProps<MyMentionElement> & { prefix?: string }) {
  const element = props.element;
  const isDocument = element.key?.startsWith('/');
  return isDocument ? <DocumentMentionElement {...props} /> : <UserMentionElement {...props} />;
}
