const FEATURE_FLAGS: Readonly<Record<string, boolean>> = {
  automations: true,
  'workspace-provider': false,
};

/**
 * Returns `true` only when the named local feature flag is explicitly enabled.
 */
export function useFeatureFlag(flag: string): boolean {
  return FEATURE_FLAGS[flag] === true;
}
