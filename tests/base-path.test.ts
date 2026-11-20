import { afterEach, describe, expect, it, vi } from "vitest";
import { getBasePath, stripBasePath, withBasePath } from "../lib/navigation/base-path";

describe("runtime base path", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("serves root paths when BASE_PATH is unset", () => {
    vi.stubEnv("BASE_PATH", "");

    expect(getBasePath()).toBe("");
    expect(withBasePath("/discover")).toBe("/discover");
  });

  it("reads BASE_PATH at call time so changing it needs no rebuild", () => {
    vi.stubEnv("BASE_PATH", "/melodarr/");
    expect(getBasePath()).toBe("/melodarr");
    expect(withBasePath("/discover")).toBe("/melodarr/discover");

    vi.stubEnv("BASE_PATH", "/music");
    expect(withBasePath("/discover")).toBe("/music/discover");
  });

  it("does not double-prefix paths that already carry the base path", () => {
    vi.stubEnv("BASE_PATH", "/melodarr");

    expect(withBasePath("/melodarr/discover")).toBe("/melodarr/discover");
    expect(withBasePath("/melodarr")).toBe("/melodarr");
  });

  it("uses the runtime-injected value in the browser", () => {
    vi.stubEnv("BASE_PATH", "/server");
    vi.stubGlobal("window", { __MELODARR_BASE_PATH__: "/browser" });

    expect(getBasePath()).toBe("/browser");
    expect(withBasePath("/discover")).toBe("/browser/discover");
    expect(stripBasePath("/browser/discover")).toBe("/discover");
  });

  it("strips only the configured prefix", () => {
    vi.stubEnv("BASE_PATH", "/melodarr");

    expect(stripBasePath("/melodarr/discover?x=1")).toBe("/discover?x=1");
    expect(stripBasePath("/other/discover")).toBe("/other/discover");
  });
});
