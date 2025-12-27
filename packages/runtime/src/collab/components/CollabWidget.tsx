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
    threadsByElementId,
    pageMetadata,
    addComment,
    resolveThread,
    deleteComment,
  } = useCollab();

  // Debug logging
  console.log("[CollabWidget] user:", user?.name, "otherUsers:", otherUsers.length, "blocks:", blockPositions.length);

  return (
    <>
      {/* Logo and online status */}
      <LogoWidget user={user} otherUsers={otherUsers} pageMetadata={pageMetadata} />

      {/* Other users' cursors - absolute in document */}
      <CursorsOverlay users={otherUsers} />

      {/* Comment margin icons - positioned absolutely in document */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 0, overflow: 'visible' }}>
        {blockPositions.map((pos) => {
          if (!pos.elementId) return null;
          return (
            <CommentMargin
              key={pos.elementId}
              elementId={pos.elementId}
              top={pos.top}
              threads={threadsByElementId[pos.elementId] || []}
              currentUser={user}
              onAddComment={(content, threadId) => addComment(pos.elementId!, content, threadId)}
              onResolve={resolveThread}
              onDelete={deleteComment}
            />
          );
        })}
      </div>
    </>
  );
}
