import React, { useEffect, useRef } from 'react';
import type * as monaco from 'monaco-editor';
import { initializeMonaco } from '@/lib/monaco';

interface MonacoEditorProps {
  value: string;
  language: string;
  path: string;
  theme: string;
  options?: monaco.editor.IStandaloneEditorConstructionOptions;
  keepCurrentModel?: boolean;
  className?: string;
  onChange?: (value: string | undefined) => void;
  onMount?: (
    editor: monaco.editor.IStandaloneCodeEditor,
    monacoInstance: typeof monaco
  ) => void;
}

function getOrCreateModel(
  monacoInstance: typeof monaco,
  value: string,
  language: string,
  path: string
): monaco.editor.ITextModel {
  const uri = monacoInstance.Uri.parse(path);
  const existingModel = monacoInstance.editor.getModel(uri);
  if (existingModel) {
    if (existingModel.getLanguageId() !== language) {
      monacoInstance.editor.setModelLanguage(existingModel, language);
    }
    return existingModel;
  }
  return monacoInstance.editor.createModel(value, language, uri);
}

export function MonacoEditor({
  value,
  language,
  path,
  theme,
  options,
  keepCurrentModel = false,
  className,
  onChange,
  onMount,
}: MonacoEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof monaco | null>(null);
  const changeDisposableRef = useRef<monaco.IDisposable | null>(null);

  useEffect(() => {
    let cancelled = false;

    const mount = async () => {
      const container = containerRef.current;
      if (!container) return;

      const monacoInstance = await initializeMonaco();
      if (cancelled) return;

      const model = getOrCreateModel(monacoInstance, value, language, path);
      const editor = monacoInstance.editor.create(container, {
        ...options,
        model,
        theme,
      });

      monacoRef.current = monacoInstance;
      editorRef.current = editor;

      changeDisposableRef.current = editor.onDidChangeModelContent(() => {
        onChange?.(editor.getValue());
      });

      onMount?.(editor, monacoInstance);
    };

    void mount();

    return () => {
      cancelled = true;
      changeDisposableRef.current?.dispose();
      changeDisposableRef.current = null;

      const editor = editorRef.current;
      const model = editor?.getModel();

      try {
        editor?.dispose();
      } catch {
        // ignore
      }

      if (!keepCurrentModel) {
        try {
          model?.dispose();
        } catch {
          // ignore
        }
      }

      editorRef.current = null;
      monacoRef.current = null;
    };
  }, []);

  useEffect(() => {
    const monacoInstance = monacoRef.current;
    const editor = editorRef.current;
    if (!monacoInstance || !editor) return;

    const nextModel = getOrCreateModel(monacoInstance, value, language, path);
    if (editor.getModel() !== nextModel) {
      editor.setModel(nextModel);
    }
  }, [language, path, value]);

  useEffect(() => {
    const monacoInstance = monacoRef.current;
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!monacoInstance || !model) return;

    if (model.getLanguageId() !== language) {
      monacoInstance.editor.setModelLanguage(model, language);
    }

    if (model.uri.toString() !== path) {
      return;
    }

    if (model.getValue() !== value) {
      model.setValue(value);
    }
  }, [language, path, value]);

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
