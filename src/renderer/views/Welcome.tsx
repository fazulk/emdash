import IconLight from '../../assets/images/emdash/icon-light.png';
import YTBanner from '../../assets/images/ytbanner.png';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/hooks/useTheme';

interface WelcomeScreenProps {
  onGetStarted: () => void;
}

export function WelcomeScreen({ onGetStarted }: WelcomeScreenProps) {
  const { effectiveTheme } = useTheme();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <div className="absolute bottom-0 left-0 right-0 h-3/5">
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage: `url(${YTBanner})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center top',
            maskImage:
              'linear-gradient(to bottom, transparent 0%, transparent 30%, rgba(0,0,0,0.4) 60%, rgba(0,0,0,0.8) 100%)',
            WebkitMaskImage:
              'linear-gradient(to bottom, transparent 0%, transparent 30%, rgba(0,0,0,0.4) 60%, rgba(0,0,0,0.8) 100%)',
          }}
        />
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center space-y-4 p-8">
        <div className="welcome-sequence welcome-sequence-icon rounded-md border border-border/40 bg-white p-1.5 shadow-lg shadow-black/5 ring-1 ring-black/5 dark:shadow-white/5 dark:ring-white/10">
          <img src={IconLight} alt="Emdash" className="h-12 w-12 rounded-sm" />
        </div>

        <h1 className="welcome-sequence welcome-sequence-title text-lg font-semibold tracking-tight text-foreground">
          Welcome.
        </h1>

        <div className="welcome-sequence welcome-sequence-cta transition-transform duration-150 ease-out hover:scale-[1.02]">
          <Button
            onClick={onGetStarted}
            size="sm"
            className={[
              'pressable-scale',
              effectiveTheme === 'dark-black' || effectiveTheme === 'dark-gray'
                ? 'bg-gray-200 text-gray-900 hover:bg-gray-300'
                : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            Start shipping
          </Button>
        </div>
      </div>
    </div>
  );
}
