import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import 'monaco-editor/min/vs/editor/editor.main.css';
import { configureMonacoTypeScript } from './monaco-config';
import { registerDiffThemes } from './monacoDiffThemes';
import { defineMonacoThemes } from './monaco-themes';

type MonacoEnvironmentConfig = {
  getWorker: (_moduleId: string, label: string) => Worker;
};

declare global {
  interface Window {
    MonacoEnvironment?: MonacoEnvironmentConfig;
  }
}

let workersConfigured = false;
let monacoInitialized = false;

function configureMonacoWorkers(): void {
  if (workersConfigured) return;

  window.MonacoEnvironment = {
    getWorker(_moduleId: string, label: string): Worker {
      if (label === 'json') {
        return new jsonWorker();
      }
      if (label === 'css' || label === 'scss' || label === 'less') {
        return new cssWorker();
      }
      if (label === 'html' || label === 'handlebars' || label === 'razor') {
        return new htmlWorker();
      }
      if (label === 'typescript' || label === 'javascript') {
        return new tsWorker();
      }
      return new editorWorker();
    },
  };

  workersConfigured = true;
}

export async function initializeMonaco(): Promise<typeof monaco> {
  configureMonacoWorkers();

  if (!monacoInitialized) {
    configureMonacoTypeScript(monaco);
    defineMonacoThemes(monaco);
    registerDiffThemes(monaco);
    monacoInitialized = true;
  }

  return monaco;
}

export { monaco };
