import React, { useCallback, useEffect, useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { cn } from '@/lib/utils';

type Variant = 'full' | 'compact';

interface MarkdownRendererProps {
  content: string;
  variant?: Variant;
  className?: string;
  /** Root path for resolving relative image paths (e.g. taskPath / worktree root) */
  rootPath?: string;
  /** Directory of the markdown file, relative to rootPath */
  fileDir?: string;
}

const fullVariantClasses = [
  '[&_h1]:mb-4',
  '[&_h1]:mt-6',
  '[&_h1]:border-b',
  '[&_h1]:border-border',
  '[&_h1]:pb-2',
  '[&_h1]:text-2xl',
  '[&_h1]:font-semibold',
  '[&_h1]:text-foreground',
  '[&_h2]:mb-3',
  '[&_h2]:mt-6',
  '[&_h2]:border-b',
  '[&_h2]:border-border',
  '[&_h2]:pb-2',
  '[&_h2]:text-xl',
  '[&_h2]:font-semibold',
  '[&_h2]:text-foreground',
  '[&_h3]:mb-2',
  '[&_h3]:mt-4',
  '[&_h3]:text-lg',
  '[&_h3]:font-semibold',
  '[&_h3]:text-foreground',
  '[&_h4]:mb-2',
  '[&_h4]:mt-4',
  '[&_h4]:text-base',
  '[&_h4]:font-semibold',
  '[&_h4]:text-foreground',
  '[&_h5]:mb-1',
  '[&_h5]:mt-3',
  '[&_h5]:text-sm',
  '[&_h5]:font-semibold',
  '[&_h5]:text-foreground',
  '[&_h6]:mb-1',
  '[&_h6]:mt-3',
  '[&_h6]:text-sm',
  '[&_h6]:font-semibold',
  '[&_h6]:text-muted-foreground',
  '[&_p]:mb-3',
  '[&_p]:text-sm',
  '[&_p]:leading-relaxed',
  '[&_p]:text-foreground',
  '[&_ul]:mb-3',
  '[&_ul]:ml-6',
  '[&_ul]:list-disc',
  '[&_ul]:space-y-1',
  '[&_ul]:text-sm',
  '[&_ul]:text-foreground',
  '[&_ol]:mb-3',
  '[&_ol]:ml-6',
  '[&_ol]:list-decimal',
  '[&_ol]:space-y-1',
  '[&_ol]:text-sm',
  '[&_ol]:text-foreground',
  '[&_li]:leading-relaxed',
  '[&_a]:text-primary',
  '[&_a]:underline',
  '[&_a]:decoration-primary/50',
  '[&_a:hover]:decoration-primary',
  '[&_blockquote]:mb-3',
  '[&_blockquote]:border-l-4',
  '[&_blockquote]:border-border',
  '[&_blockquote]:bg-muted/30',
  '[&_blockquote]:py-1',
  '[&_blockquote]:pl-4',
  '[&_blockquote]:text-sm',
  '[&_blockquote]:italic',
  '[&_blockquote]:text-muted-foreground',
  '[&_table]:mb-3',
  '[&_table]:w-full',
  '[&_table]:border-collapse',
  '[&_table]:text-sm',
  '[&_thead]:border-b',
  '[&_thead]:border-border',
  '[&_thead]:bg-muted/30',
  '[&_th]:px-3',
  '[&_th]:py-2',
  '[&_th]:text-left',
  '[&_th]:font-semibold',
  '[&_th]:text-foreground',
  '[&_td]:border-t',
  '[&_td]:border-border',
  '[&_td]:px-3',
  '[&_td]:py-2',
  '[&_td]:text-foreground',
  '[&_hr]:my-6',
  '[&_hr]:border-border',
  '[&_img]:my-3',
  '[&_img]:max-w-full',
  '[&_img]:rounded',
  '[&_pre]:mb-3',
  '[&_pre]:overflow-x-auto',
  '[&_pre]:rounded-md',
  '[&_pre]:border',
  '[&_pre]:border-border',
  '[&_pre]:bg-muted/50',
  '[&_pre]:p-3',
  '[&_pre]:text-xs',
  '[&_pre]:text-foreground',
  '[&_code]:font-mono',
  '[&_code]:rounded',
  '[&_code]:bg-muted',
  '[&_code]:px-1.5',
  '[&_code]:py-0.5',
  '[&_code]:text-xs',
  '[&_strong]:font-semibold',
  '[&_strong]:text-foreground',
  '[&_input[type=checkbox]]:mr-2',
  '[&_input[type=checkbox]]:align-middle',
].join(' ');

const compactVariantClasses = [
  '[&_h1]:mb-1',
  '[&_h1]:mt-3',
  '[&_h1]:text-sm',
  '[&_h1]:font-semibold',
  '[&_h1]:text-foreground',
  '[&_h2]:mb-1',
  '[&_h2]:mt-3',
  '[&_h2]:text-sm',
  '[&_h2]:font-semibold',
  '[&_h2]:text-foreground',
  '[&_h3]:mb-1',
  '[&_h3]:mt-2',
  '[&_h3]:text-xs',
  '[&_h3]:font-semibold',
  '[&_h3]:text-foreground',
  '[&_p]:mb-2',
  '[&_p]:leading-relaxed',
  '[&_ul]:mb-2',
  '[&_ul]:ml-4',
  '[&_ul]:list-disc',
  '[&_ul]:space-y-0.5',
  '[&_ol]:mb-2',
  '[&_ol]:ml-4',
  '[&_ol]:list-decimal',
  '[&_ol]:space-y-0.5',
  '[&_li]:leading-relaxed',
  '[&_a]:text-primary',
  '[&_a]:underline',
  '[&_pre]:mb-2',
  '[&_pre]:overflow-x-auto',
  '[&_pre]:rounded',
  '[&_pre]:bg-muted/60',
  '[&_pre]:p-2',
  '[&_pre]:text-[11px]',
  '[&_code]:font-mono',
  '[&_code]:rounded',
  '[&_code]:bg-muted/60',
  '[&_code]:px-1',
  '[&_code]:py-0.5',
  '[&_code]:text-[11px]',
  '[&_strong]:font-semibold',
  '[&_strong]:text-foreground',
].join(' ');

function resolveRelativePath(fileDir: string, src: string): string {
  return fileDir ? `${fileDir}/${src}` : src;
}

function renderMarkdown(content: string): string {
  return marked.parse(content, { gfm: true }) as string;
}

async function resolveLocalImages(html: string, rootPath?: string, fileDir?: string): Promise<string> {
  if (!rootPath || typeof window === 'undefined' || !window.electronAPI?.fsReadImage) {
    return html;
  }

  const parser = new DOMParser();
  const document = parser.parseFromString(html, 'text/html');
  const images = Array.from(document.querySelectorAll('img'));
  const localImages = images.filter((image) => {
    const src = image.getAttribute('src');
    return !!src && !/^(?:[a-z]+:)?\/\//i.test(src) && !src.startsWith('data:');
  });

  if (localImages.length === 0) {
    return html;
  }

  await Promise.all(
    localImages.map(async (image) => {
      const src = image.getAttribute('src');
      if (!src) return;

      try {
        const result = await window.electronAPI.fsReadImage(rootPath, resolveRelativePath(fileDir || '', src));
        if (result.success && result.dataUrl) {
          image.setAttribute('src', result.dataUrl);
          return;
        }
      } catch {
        // Leave a readable placeholder in place of a broken local image.
      }

      const fallback = document.createElement('span');
      fallback.className = 'my-3 inline-block text-xs text-muted-foreground';
      fallback.textContent = `[Image not found: ${src}]`;
      image.replaceWith(fallback);
    })
  );

  return document.body.innerHTML;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  variant = 'full',
  className,
  rootPath,
  fileDir,
}) => {
  const [resolvedHtml, setResolvedHtml] = useState('');

  const sanitizedHtml = useMemo(() => {
    const renderedHtml = renderMarkdown(content);
    return DOMPurify.sanitize(renderedHtml, {
      ADD_ATTR: ['target', 'rel'],
    });
  }, [content]);

  useEffect(() => {
    let cancelled = false;

    void resolveLocalImages(sanitizedHtml, rootPath, fileDir).then((nextHtml) => {
      if (!cancelled) {
        setResolvedHtml(nextHtml);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [fileDir, rootPath, sanitizedHtml]);

  const handleClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const anchor = target.closest('a');
    if (!(anchor instanceof HTMLAnchorElement)) return;

    const href = anchor.getAttribute('href');
    if (!href || !/^https?:\/\//i.test(href) || !window.electronAPI?.openExternal) {
      return;
    }

    event.preventDefault();
    window.electronAPI.openExternal(href).catch(() => {});
  }, []);

  return (
    <div
      className={cn(
        variant === 'full' ? fullVariantClasses : compactVariantClasses,
        className
      )}
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: resolvedHtml }}
    />
  );
};
