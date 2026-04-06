import React from 'react';
import { Switch } from './ui/switch';
import { useTelemetryConsent } from '../hooks/useTelemetryConsent';

const TelemetryCard: React.FC = () => {
  const { prefEnabled, envDisabled, hasKeyAndHost, loading, setTelemetryEnabled } =
    useTelemetryConsent();

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-1 flex-col gap-0.5">
        <p className="text-sm font-medium text-foreground">Privacy & Telemetry</p>
        <div className="text-sm text-muted-foreground">
          <p>Product telemetry is currently unavailable in this build.</p>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <Switch
          checked={prefEnabled}
          onCheckedChange={async (checked) => {
            void import('../lib/telemetryClient').then(({ captureTelemetry }) => {
              captureTelemetry('telemetry_toggled', { enabled: checked });
            });
            void setTelemetryEnabled(checked);
          }}
          disabled={loading || envDisabled || !hasKeyAndHost}
          aria-label="Enable anonymous telemetry"
        />
        {!hasKeyAndHost && (
          <span className="text-[10px] text-muted-foreground">Inactive in this build</span>
        )}
      </div>
    </div>
  );
};

export default TelemetryCard;
