interface PageProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
}

/**
 * Page wrapper component - renders content inside the Document.
 * Passes title/description via data attributes for client-side extraction.
 * rwsdk's RSC streaming doesn't support React 19 head hoisting.
 */
export const Page: React.FC<PageProps> = ({ children, title, description }) => {
  return (
    <div data-page-title={title} data-page-description={description}>
      {children}
    </div>
  );
};
