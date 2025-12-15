/**
 * Plate Static Components Bundle
 *
 * All static (SSR/RSC-safe) components for rendering Plate documents.
 * Use with PlateStatic or createSlateEditor({ components }).
 */

// Core
export { EditorStatic, editorVariants } from './editor-static';

// Block Elements
export { ParagraphElementStatic } from './paragraph-node-static';
export { H1ElementStatic, H2ElementStatic, H3ElementStatic, HeadingElementStatic } from './heading-node-static';
export { BlockquoteElementStatic } from './blockquote-node-static';
export { CodeBlockElementStatic, CodeLineElementStatic, CodeSyntaxLeafStatic } from './code-block-node-static';
export { HrElementStatic } from './hr-node-static';
export { CalloutElementStatic } from './callout-node-static';
export { ToggleElementStatic } from './toggle-node-static';

// Lists
export { BlockListStatic } from './block-list-static';

// Inline Elements
export { LinkElementStatic } from './link-node-static';
export { MentionElementStatic } from './mention-node-static';
export { DateElementStatic } from './date-node-static';

// Leaf (text formatting)
export { CodeLeafStatic } from './code-node-static';
export { CommentLeafStatic } from './comment-node-static';
export { SuggestionLeafStatic } from './suggestion-node-static';

// Media
export { ImageElementStatic } from './media-image-node-static';
export { MediaVideoElementStatic } from './media-video-node-static';
export { MediaAudioElementStatic } from './media-audio-node-static';
export { MediaFileElementStatic } from './media-file-node-static';

// Table
export {
  TableElementStatic,
  TableRowElementStatic,
  TableCellElementStatic,
  TableCellHeaderElementStatic,
} from './table-node-static';

// Layout
export { ColumnGroupElementStatic, ColumnElementStatic } from './column-node-static';

// Special
export { TocElementStatic } from './toc-node-static';
export { EquationElementStatic, InlineEquationElementStatic } from './equation-node-static';
