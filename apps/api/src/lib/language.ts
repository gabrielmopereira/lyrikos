export const isRegionSpecificLanguageTag = (tag: string): boolean => {
  try {
    const locale = new Intl.Locale(tag);
    return locale.region !== undefined;
  } catch {
    return false;
  }
};

export const canonicalizeLanguageTag = (tag: string): string => new Intl.Locale(tag).baseName;
