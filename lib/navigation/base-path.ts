import type { Route } from "next";

declare global {
  interface Window {
    __MELODARR_BASE_PATH__?: string;
  }
}

const normalizeBasePath = (raw?: string | null): string => {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) {
    return "";
  }

  const normalized = trimmed.replace(/\/+$/, "");
  return normalized.startsWith("/") ? normalized : "";
};

export const getBasePath = (): string => {
  if (typeof window !== "undefined") {
    return normalizeBasePath(window.__MELODARR_BASE_PATH__);
  }

  return normalizeBasePath(process.env.BASE_PATH);
};

export function withBasePath(path: Route): Route;
export function withBasePath(path: string): string;
export function withBasePath(path: string): string {
  const basePath = getBasePath();
  if (!basePath || path === basePath || path.startsWith(`${basePath}/`)) {
    return path;
  }

  return `${basePath}${path.startsWith("/") ? path : `/${path}`}`;
}

export const stripBasePath = (path: string): string => {
  const basePath = getBasePath();
  if (!basePath) {
    return path;
  }

  if (path === basePath) {
    return "/";
  }

  return path.startsWith(`${basePath}/`) ? path.slice(basePath.length) : path;
};
