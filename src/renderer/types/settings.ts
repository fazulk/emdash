export const SETTINGS_PAGE_TABS = [
  'general',
  'clis-models',
  'integrations',
  'repository',
  'interface',
  'docs',
  'account',
] as const;

export type SettingsPageTab = (typeof SETTINGS_PAGE_TABS)[number];
