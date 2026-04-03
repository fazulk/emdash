declare global {
  interface Window {
    __EMDASH_RENDERER_BOOT_ID__?: string;
  }
}

function createRendererBootSessionId(): string {
  const randomUuid = globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
  if (typeof randomUuid === 'function') {
    return randomUuid();
  }
  return `renderer-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const rendererBootSessionId = (() => {
  if (typeof window === 'undefined') {
    return 'renderer-ssr';
  }

  if (!window.__EMDASH_RENDERER_BOOT_ID__) {
    window.__EMDASH_RENDERER_BOOT_ID__ = createRendererBootSessionId();
  }

  return window.__EMDASH_RENDERER_BOOT_ID__;
})();
