import { Outlet } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ErrorBoundary from './components/ErrorBoundary';
import { ThemeProvider } from './components/ThemeProvider';
import { FIRST_LAUNCH_KEY } from './constants/layout';
import { AppContextProvider } from './contexts/AppContextProvider';
import { AppSettingsProvider } from './contexts/AppSettingsProvider';
import { EmdashAccountProvider } from './contexts/EmdashAccountProvider';
import { GithubContextProvider } from './contexts/GithubContextProvider';
import { ModalProvider } from './contexts/ModalProvider';
import { ProjectManagementProvider } from './contexts/ProjectManagementProvider';
import { TaskManagementProvider } from './contexts/TaskManagementContext';
import { useLocalStorage } from './hooks/useLocalStorage';
import { WelcomeScreen } from './views/Welcome';
import { Workspace } from './views/Workspace';

const queryClient = new QueryClient();

function AppContent() {
  const [isFirstLaunch, setIsFirstLaunch] = useLocalStorage<boolean | number>(
    FIRST_LAUNCH_KEY,
    true
  );

  const isFirstLaunchBool = isFirstLaunch === true || isFirstLaunch === 1;

  if (isFirstLaunchBool) {
    return <WelcomeScreen onGetStarted={() => setIsFirstLaunch(false)} />;
  }

  return <Workspace />;
}

export function AppProviders() {
  return (
    <QueryClientProvider client={queryClient}>
      <ModalProvider>
        <AppContextProvider>
          <EmdashAccountProvider>
            <GithubContextProvider>
              <ProjectManagementProvider>
                <TaskManagementProvider>
                  <AppSettingsProvider>
                    <ThemeProvider>
                      <ErrorBoundary>
                        <Outlet />
                      </ErrorBoundary>
                    </ThemeProvider>
                  </AppSettingsProvider>
                </TaskManagementProvider>
              </ProjectManagementProvider>
            </GithubContextProvider>
          </EmdashAccountProvider>
        </AppContextProvider>
      </ModalProvider>
    </QueryClientProvider>
  );
}

export function WorkspaceRouteContent() {
  return <AppContent />;
}
