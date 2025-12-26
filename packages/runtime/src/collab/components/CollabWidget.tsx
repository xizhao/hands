"use client";

import { LogoWidget } from "./LogoWidget";
import { CursorsOverlay } from "./CursorsOverlay";
import { CommentMargin } from "./CommentMargin";
import { useCollab } from "./CollabProvider";

export function CollabWidget() {
  const {
    user,
    otherUsers,
    blockPositions,
    threadsByBlock,
    pageMetadata,
    addComment,
    resolveThread,
    deleteComment,
  } = useCollab();

  return (
    <>
      {/* Logo and online status */}
      <LogoWidget user={user} otherUsers={otherUsers} pageMetadata={pageMetadata} />

      {/* Other users' cursors */}
      <CursorsOverlay users={otherUsers} />

      {/* Comment margin icons */}
      <div className="fixed left-0 top-0 w-0 h-0">
        <div className="relative">
          {blockPositions.map((pos) => (
            <CommentMargin
              key={pos.index}
              blockIndex={pos.index}
              top={pos.top}
              threads={threadsByBlock[pos.index] || []}
              currentUser={user}
              onAddComment={(content, threadId) => addComment(pos.index, content, threadId)}
              onResolve={resolveThread}
              onDelete={deleteComment}
            />
          ))}
        </div>
      </div>
    </>
  );
}
