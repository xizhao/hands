"use client";

interface NavPage {
  id: string;
  path: string;
  title: string;
}

interface ViewerNavProps {
  pages: NavPage[];
  workbookId: string;
  currentPath: string;
}

/** Hands Logo - hand outline */
function HandsLogo({ size = 20 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />
      <path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2" />
      <path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </svg>
  );
}

export function ViewerNav({ pages, workbookId, currentPath }: ViewerNavProps) {
  const workbookRoot = `/${workbookId}`;

  return (
    <div className="fixed top-6 left-2 z-50 group">
      {/* Logo - always visible, links to workbook root */}
      <a
        href={workbookRoot}
        className="
          flex items-center justify-center
          w-10 h-10
          bg-neutral-900 text-white border border-neutral-800/50
          rounded-xl
          shadow-lg shadow-black/25
          hover:bg-neutral-800
          transition-colors
        "
      >
        <HandsLogo size={20} />
      </a>

      {/* Slide-in nav panel - appears on hover */}
      <div
        className="
          absolute top-0 left-0
          w-52
          bg-neutral-900 border border-neutral-800/50
          rounded-xl
          shadow-xl shadow-black/30
          transition-all duration-200 ease-out
          origin-top-left
          opacity-0 scale-95 pointer-events-none
          group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto
        "
      >
        {/* Header with logo */}
        <div className="flex items-center gap-2.5 p-2 border-b border-neutral-800/50">
          <a
            href={workbookRoot}
            className="
              flex items-center justify-center
              w-10 h-10
              bg-neutral-800 text-white border border-neutral-700/50
              rounded-xl
              hover:bg-neutral-700
              transition-colors
              shrink-0
            "
          >
            <HandsLogo size={20} />
          </a>
          <span className="text-xs font-medium text-white truncate">
            {workbookId}
          </span>
        </div>

        {/* Nav items */}
        <nav className="p-1.5 max-h-72 overflow-auto">
          {pages.map((page) => {
            const pageRoute = `/${workbookId}${page.path}`;
            const isActive = page.path === currentPath || pageRoute === currentPath;

            return (
              <a
                key={page.id}
                href={pageRoute}
                className={`
                  block px-2.5 py-1.5 rounded-lg text-xs truncate transition-colors
                  ${isActive
                    ? "bg-blue-500/20 text-blue-400 font-medium"
                    : "text-neutral-400 hover:text-white hover:bg-white/5"
                  }
                `}
              >
                {page.title}
              </a>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-2 border-t border-neutral-800/50">
          <a
            href="https://hands.app"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1 text-[9px] text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            Built with Hands
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M7 17L17 7M17 7H7M17 7v10" />
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
}

/** Mount the viewer nav - called from client.tsx */
export function mountViewerNav(config: { pages: NavPage[]; workbookId: string; currentPath: string }) {
  const container = document.createElement("div");
  container.id = "viewer-nav";
  document.body.appendChild(container);

  // Dynamic import React to avoid SSR issues
  import("react-dom/client").then(({ createRoot }) => {
    const root = createRoot(container);
    root.render(
      <ViewerNav
        pages={config.pages}
        workbookId={config.workbookId}
        currentPath={config.currentPath}
      />
    );
  });
}
