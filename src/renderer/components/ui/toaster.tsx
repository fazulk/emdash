'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from './toast';
import { useToast } from '../../hooks/use-toast';
import { AlertCircle, Copy, Check } from 'lucide-react';

function getToastTextContent(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(getToastTextContent).join('');
  if (typeof node === 'object' && 'props' in node) {
    const { children } = (node as React.ReactElement).props ?? {};
    return getToastTextContent(children);
  }
  return '';
}

function ToastWithCopy({
  id,
  title,
  description,
  descriptionClassName,
  action,
  variant,
  ...props
}: {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  descriptionClassName?: string;
  action?: React.ReactElement;
  variant?: 'default' | 'destructive';
  [key: string]: unknown;
}) {
  const [copied, setCopied] = useState(false);
  const isDestructive = variant === 'destructive';

  const handleCopy = useCallback(() => {
    const titleText = getToastTextContent(title);
    const descText = getToastTextContent(description);
    const text = [titleText, descText].filter(Boolean).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [title, description]);

  return (
    <Toast key={id} variant={variant} {...props}>
      <div className="flex gap-3 pr-6">
        {isDestructive && (
          <AlertCircle className="mt-0.5 h-5 w-5 flex-none self-start text-amber-600 dark:text-amber-400" />
        )}
        <div className="min-w-0 flex-1">
          <div className="grid gap-1">
            {title && <ToastTitle>{title}</ToastTitle>}
            {description && (
              <ToastDescription
                className={isDestructive ? `break-words text-sm opacity-90 ${descriptionClassName ?? ''}` : descriptionClassName}
              >
                {description}
              </ToastDescription>
            )}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border bg-transparent px-3 text-sm font-medium ring-offset-background transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              {copied ? (
                <><Check className="h-3.5 w-3.5" /> Copied</>
              ) : (
                <><Copy className="h-3.5 w-3.5" /> Copy</>
              )}
            </button>
            {action}
          </div>
        </div>
      </div>
      <ToastClose />
    </Toast>
  );
}

export function Toaster() {
  const { toasts } = useToast();

  const lastFocusedOutsideToast = useRef<HTMLElement | null>(null);
  const previousToastsCount = useRef(0);

  const isInToastViewport = (element: Element | null) =>
    element?.closest?.('[data-radix-toast-viewport]') != null;

  // Track the most recent focus target outside the toast viewport so we can
  // restore it if Radix shifts focus to the toast/viewport when a toast opens.
  useEffect(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && !isInToastViewport(active) && active !== document.body) {
      lastFocusedOutsideToast.current = active;
    }

    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (isInToastViewport(target)) return;
      if (target === document.body) return;
      lastFocusedOutsideToast.current = target;
    };

    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
    };
  }, []);

  useEffect(() => {
    const currentToastsCount = toasts.length;
    const toastsChanged = currentToastsCount !== previousToastsCount.current;
    if (!toastsChanged) return;

    requestAnimationFrame(() => {
      const currentFocus = document.activeElement;
      const focusIsOnToast = isInToastViewport(currentFocus);
      const focusIsOnBody = currentFocus === document.body;
      const restoreTarget = lastFocusedOutsideToast.current;

      if (
        (focusIsOnToast || focusIsOnBody) &&
        restoreTarget &&
        document.body.contains(restoreTarget) &&
        restoreTarget !== document.activeElement
      ) {
        restoreTarget.focus();
      }
    });

    previousToastsCount.current = currentToastsCount;
  }, [toasts.length]);

  return (
    <ToastProvider>
      {toasts.map(function ({
        id,
        title,
        description,
        descriptionClassName,
        action,
        variant,
        ...props
      }) {
        return (
          <ToastWithCopy
            key={id}
            id={id}
            title={title}
            description={description}
            descriptionClassName={descriptionClassName}
            action={action}
            variant={variant}
            {...props}
          />
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
