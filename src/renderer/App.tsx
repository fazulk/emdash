import { RouterProvider } from '@tanstack/react-router';
import { appRouter } from './router';

export function App() {
  return <RouterProvider router={appRouter} />;
}
