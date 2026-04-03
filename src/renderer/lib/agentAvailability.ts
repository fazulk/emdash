import type { AppSettings } from 'src/main/settings';

export function getDisabledProviderIds(settings?: Pick<AppSettings, 'disabledProviders'>): string[] {
  return Array.isArray(settings?.disabledProviders) ? settings!.disabledProviders.filter(Boolean) : [];
}

export function isProviderDisabled(
  providerId: string,
  settings?: Pick<AppSettings, 'disabledProviders'>
): boolean {
  return getDisabledProviderIds(settings).includes(providerId);
}

export function filterDisabledProviders<T extends string>(
  providerIds: readonly T[],
  settings?: Pick<AppSettings, 'disabledProviders'>
): T[] {
  const disabled = new Set(getDisabledProviderIds(settings));
  return providerIds.filter((providerId) => !disabled.has(providerId));
}

export function getFirstEnabledProvider<T extends string>(
  providerIds: readonly T[],
  settings?: Pick<AppSettings, 'disabledProviders'>
): T | undefined {
  return filterDisabledProviders(providerIds, settings)[0];
}
