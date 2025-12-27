interface PageProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
}

/**
 * Page wrapper component - renders content inside the Document.
 * Title/description are passed for future head management.
 * For now, Document sets a static title - we can add dynamic head later.
 */
export const Page: React.FC<PageProps> = ({ children }) => {
  return <>{children}</>;
};
