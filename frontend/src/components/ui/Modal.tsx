import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  if (!open) return null;
  const sizeClass = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
  }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4 animate-fade-in">
      <div
        className={cn(
          'card w-full animate-slide-up max-h-[90vh] overflow-hidden flex flex-col',
          sizeClass,
        )}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-ink-200 px-5 py-3">
            <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
            <button
              onClick={onClose}
              className="rounded-md p-1 text-ink-500 hover:bg-ink-100"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div className="scroll-area overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
