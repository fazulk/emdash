import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';

describe('MarkdownRenderer', () => {
  const openExternal = vi.fn().mockResolvedValue(undefined);
  const fsReadImage = vi.fn();

  beforeEach(() => {
    openExternal.mockClear();
    fsReadImage.mockReset();
    fsReadImage.mockResolvedValue({
      success: true,
      dataUrl: 'data:image/png;base64,abc123',
    });

    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        openExternal,
        fsReadImage,
      },
    });
  });

  it('renders markdown as sanitized HTML', async () => {
    render(<MarkdownRenderer content={'# Hello\n\n<script>alert(1)</script>\n\nParagraph'} />);

    await waitFor(() => {
      expect(screen.getByText('Hello')).toBeInTheDocument();
      expect(screen.getByText('Paragraph')).toBeInTheDocument();
    });

    expect(document.querySelector('script')).toBeNull();
  });

  it('opens external links through electron', async () => {
    render(<MarkdownRenderer content={'[Docs](https://example.com/docs)'} />);

    const link = await screen.findByRole('link', { name: 'Docs' });
    fireEvent.click(link);

    expect(openExternal).toHaveBeenCalledWith('https://example.com/docs');
  });

  it('resolves local markdown images through electron', async () => {
    render(
      <MarkdownRenderer
        content={'![Diagram](images/diagram.png)'}
        rootPath="/tmp/task"
        fileDir="docs"
      />
    );

    const image = await screen.findByRole('img', { name: 'Diagram' });

    await waitFor(() => {
      expect(fsReadImage).toHaveBeenCalledWith('/tmp/task', 'docs/images/diagram.png');
      expect(image).toHaveAttribute('src', 'data:image/png;base64,abc123');
    });
  });
});
