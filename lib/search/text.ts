export const normalizeText = (value?: string | null): string => value?.trim().toLowerCase() ?? "";

export const normalizeReleaseGroup = (type?: string): "album" | "single" => {
  const normalizedType = normalizeText(type);
  return normalizedType === "single" ? "single" : "album";
};

export const DEFAULT_RELEASE_SORT = "newest";
