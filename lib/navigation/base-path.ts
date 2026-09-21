import type { Route } from "next";

const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? process.env.BASE_PATH;
const basePath = rawBasePath?.trim().replace(/\/+$/, "") ?? "";

export function withBasePath(path: Route): Route;
export function withBasePath(path: string): string;
export function withBasePath(path: string): string {
  if (!basePath || path === basePath || path.startsWith(`${basePath}/`)) {
    return path;
  }

  return `${basePath}${path.startsWith("/") ? path : `/${path}`}`;
}
