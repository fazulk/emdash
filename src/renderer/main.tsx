import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { registerRendererUnloadPtyCleanup } from './terminal/SessionRegistry';
import './index.css';

registerRendererUnloadPtyCleanup();

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

// Avoid double-mount in dev which can duplicate PTY sessions
root.render(<App />);
