// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { DiscoverHomeData } from "@/lib/discover/home";

type TestRelease = {
  title: string;
  artistName: string;
  foreignArtistId?: string;
  foreignAlbumId?: string;
  releaseDate?: string;
  images?: Array<{ coverType?: string; url?: string }>;
};

type TestResults = {
  artists: Array<{ artistName: string; foreignArtistId?: string; images?: Array<{ coverType?: string; url?: string }> }>;
  albums: TestRelease[];
  singles: TestRelease[];
};

const sortReleasesSpy = vi.fn();

vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt?: string; src: string }) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={alt} src={typeof src === "string" ? src : undefined} />;
  }
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/discover",
  useSearchParams: () => new URLSearchParams("q=test")
}));

vi.mock("@/components/ui/toast-provider", () => ({
  useToast: () => ({ error: vi.fn(), info: vi.fn(), success: vi.fn() })
}));

vi.mock("@/lib/discover/release-browser", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/discover/release-browser")>();
  return {
    ...actual,
    sortReleases: (releases: unknown, sort: unknown) => {
      sortReleasesSpy(releases);
      return actual.sortReleases(releases as never, sort as never);
    }
  };
});

class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

const homeData: DiscoverHomeData = {
  freshPickCount: 0,
  queuedRequestCount: 0,
  readyToPlayCount: 0,
  freshThisWeek: [],
  libraryStatus: "not_configured"
};

const makeResults = (): TestResults => ({
  artists: [
    {
      artistName: "Artist A",
      foreignArtistId: "artist-a",
      images: [{ coverType: "cover", url: "https://example.test/a.jpg" }]
    }
  ],
  albums: Array.from({ length: 30 }, (_, index) => ({
    title: `Album ${index}`,
    artistName: "Artist A",
    foreignArtistId: "artist-a",
    foreignAlbumId: `album-${index}`,
    releaseDate: "2020-01-01",
    images: [{ coverType: "cover", url: `https://example.test/${index}.jpg` }]
  })),
  singles: Array.from({ length: 30 }, (_, index) => ({
    title: `Single ${index}`,
    artistName: "Artist A",
    foreignArtistId: "artist-a",
    foreignAlbumId: `single-${index}`,
    releaseDate: "2021-01-01",
    images: [{ coverType: "cover", url: `https://example.test/s${index}.jpg` }]
  }))
});

describe("discover client render work", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("IntersectionObserver", IntersectionObserverStub);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("sorts each release collection only once for a given result set", async () => {
    const results = makeResults();
    window.history.replaceState(
      { discoverSnapshot: { query: "test", filter: "all", sort: "newest", results } },
      "",
      "/discover?q=test"
    );

    const { DiscoverClient } = await import("@/components/discover-client");
    render(<DiscoverClient homeData={homeData} />);

    const sortInputs = sortReleasesSpy.mock.calls.map(([input]) => input);
    expect(sortInputs.filter((input) => input === results.albums)).toHaveLength(1);
    expect(sortInputs.filter((input) => input === results.singles)).toHaveLength(1);
    expect(screen.getByText(/60 releases found/)).toBeTruthy();
  });
});
