/**
 * PageTab - MDX documentation for a domain/table
 *
 * Shows page content if exists, or auto-creates an empty page with frontmatter.
 * Empty pages show a ChatGPT-style prompt input using the description field.
 */

import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { PageEditor } from "../../page-editor/PageEditor";
import type { Domain } from "../../sidebar/domain/types";

interface PageTabProps {
  domain: Domain;
}

/** Convert domain name to valid pageId (lowercase, hyphens only) */
function toPageId(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric with hyphens
      .replace(/^-+|-+$/g, "") // Trim leading/trailing hyphens
      .replace(/-+/g, "-") || // Collapse multiple hyphens
    "untitled"
  );
}

export function PageTab({ domain }: PageTabProps) {
  // Track current domain to detect changes
  const prevDomainIdRef = useRef(domain.id);
  const [pageId, setPageId] = useState<string | null>(domain.pageId || null);

  // Reset pageId when domain changes
  useEffect(() => {
    if (prevDomainIdRef.current !== domain.id) {
      prevDomainIdRef.current = domain.id;
      setPageId(domain.pageId || null);
    }
  }, [domain.id, domain.pageId]);

  // Auto-create empty page with frontmatter only
  const createPage = trpc.pages.create.useMutation({
    onSuccess: (result) => {
      setPageId(result.pageId);
    },
  });

  // Auto-create page on mount or when domain changes if it doesn't exist
  useEffect(() => {
    if (!domain.hasPage && !pageId && !createPage.isPending) {
      const sanitizedId = toPageId(domain.id);
      createPage.mutate({ pageId: sanitizedId });
    }
  }, [domain.hasPage, domain.id, pageId, createPage]);

  // Show loading while creating page
  if (createPage.isPending) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">Creating page...</p>
      </div>
    );
  }

  // If we have a pageId (either from domain or newly created), show editor
  const effectivePageId = pageId || domain.pageId;
  if (effectivePageId) {
    return (
      <div className="h-full">
        <PageEditor pageId={effectivePageId} className="h-full" />
      </div>
    );
  }

  // Fallback loading state
  return (
    <div className="h-full flex items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

export default PageTab;
