import { cn } from '@/lib/utils';

interface HandsLogoProps {
  className?: string;
}

/**
 * Hands Logo - Sparkle/stars icon representing AI capabilities
 * Used across the app for AI/Hands branding
 */
export function HandsLogo({ className }: HandsLogoProps) {
  return (
    <svg
      className={cn('size-4', className)}
      viewBox="0 0 16 16"
      fill="currentColor"
    >
      {/* Large sparkle */}
      <path d="M7.657 6.247c.11-.33.576-.33.686 0l.645 1.937a2.89 2.89 0 0 0 1.828 1.828l1.937.645c.33.11.33.576 0 .686l-1.937.645a2.89 2.89 0 0 0-1.828 1.828l-.645 1.937a.361.361 0 0 1-.686 0l-.645-1.937a2.89 2.89 0 0 0-1.828-1.828l-1.937-.645a.361.361 0 0 1 0-.686l1.937-.645a2.89 2.89 0 0 0 1.828-1.828l.645-1.937z" />
      {/* Small sparkle */}
      <path d="M3.794 1.148a.217.217 0 0 1 .412 0l.387 1.162c.173.518.579.924 1.097 1.097l1.162.387a.217.217 0 0 1 0 .412l-1.162.387A1.734 1.734 0 0 0 4.593 5.69l-.387 1.162a.217.217 0 0 1-.412 0L3.407 5.69a1.734 1.734 0 0 0-1.097-1.097l-1.162-.387a.217.217 0 0 1 0-.412l1.162-.387A1.734 1.734 0 0 0 3.407 2.31l.387-1.162z" />
    </svg>
  );
}
