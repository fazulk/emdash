import React, { useEffect, useRef } from 'react';
import type * as monaco from 'monaco-editor';
import { initializeMonaco } from '@/lib/monaco';

interface MonacoDiffEditorProps {
  original: string;
  modified: string;
  language: string;
  theme: string;
  options?: monaco.editor.IDiffEditorConstructionOptions;
  className?: string;
  onMount?: (
    editor: monaco.editor.IStandaloneDiffEditor,
    monacoInstance: typeof monaco
  ) => void;
}

export function MonacoDiffEditor({
  original,
  modified,
  language,
  theme,
  options,
  className,
  onMount,
}: MonacoDiffEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const monacoRef = useRef<typeof monaco | null>(null);
  const originalModelRef = useRef<monaco.editor.ITextModel | null>(null);
  const modifiedModelRef = useRef<monaco.editor.ITextModel | null>(null);

  useEffect(() => {
    let cancelled = false;

    const mount = async () => {
      const container = containerRef.current;
      if (!container) return;

      const monacoInstance = await initializeMonaco();
      if (cancelled) return;

      const originalModel = monacoInstance.editor.createModel(original, language);
      const modifiedModel = monacoInstance.editor.createModel(modified, language);
      const editor = monacoInstance.editor.createDiffEditor(container, {
        ...options,
        theme,
      });

      editor.setModel({
        original: originalModel,
        modified: modifiedModel,
      });

      monacoRef.current = monacoInstance;
      editorRef.current = editor;
      originalModelRef.current = originalModel;
      modifiedModelRef.current = modifiedModel;

      onMount?.(editor, monacoInstance);
    };

    void mount();

    return () => {
      cancelled = true;

      try {
        editorRef.current?.dispose();
      } catch {
        // ignore
      }

      try {
        originalModelRef.current?.dispose();
      } catch {
        // ignore
      }

      try {
        modifiedModelRef.current?.dispose();
      } catch {
        // ignore
      }

      editorRef.current = null;
      monacoRef.current = null;
      originalModelRef.current = null;
      modifiedModelRef.current = null;
    };
  }, []);

  useEffect(() => {
    const monacoInstance = monacoRef.current;
    const originalModel = originalModelRef.current;
    const modifiedModel = modifiedModelRef.current;
    if (!monacoInstance || !originalModel || !modifiedModel) return;

    if (originalModel.getLanguageId() !== language) {
      monacoInstance.editor.setModelLanguage(originalModel, language);
    }
    if (modifiedModel.getLanguageId() !== language) {
      monacoInstance.editor.setModelLanguage(modifiedModel, language);
    }
  }, [language]);

  useEffect(() => {
    const originalModel = originalModelRef.current;
    if (!originalModel) return;
    if (originalModel.getValue() !== original) {
      originalModel.setValue(original);
    }
  }, [original]);

  useEffect(() => {
    const modifiedModel = modifiedModelRef.current;
    if (!modifiedModel) return;
    if (modifiedModel.getValue() !== modified) {
      modifiedModel.setValue(modified);
    }
  }, [modified]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !options) return;
    editor.updateOptions(options);
  }, [options]);

  useEffect(() => {
    const monacoInstance = monacoRef.current;
    if (!monacoInstance) return;
    monacoInstance.editor.setTheme(theme);
  }, [theme]);

  return <div ref={containerRef} className={className ?? 'h-full w-full'} />;
}
