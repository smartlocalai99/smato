import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import PlayerPage from "@/app/player/page";
import { deleteAds, downloadAd, putAd } from "@/lib/adCache";

// What the fake backend and the fake tablet disk hold, shared with the
// module mocks below.
const state = vi.hoisted(() => ({
  ads: [],
  adsQueries: 0,
  downloaded: new Set(),
  broadcastHandlers: {},
  subscribeCallback: null,
}));

vi.mock("@/lib/supabase", () => ({
  ADS_CHANNEL_NAME: "test-ads",
  adFileUrl: (path) => `https://storage.test/${path}`,
  supabase: {
    from: (table) => {
      const filters = [];
      const query = {
        select: () => query,
        eq: (column, value) => {
          filters.push([column, value]);
          return query;
        },
        or: () => query,
        upsert: () => Promise.resolve({ error: null }),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        then: (resolve, reject) => {
          if (table === "ads") state.adsQueries += 1;
          const rows = table === "ads" ? state.ads : [];
          const data = rows.filter((row) => filters.every(([column, value]) => row[column] === value));
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
    channel: () => {
      const channel = {
        on: (_type, { event }, handler) => {
          state.broadcastHandlers[event] = handler;
          return channel;
        },
        subscribe: (callback) => {
          state.subscribeCallback = callback;
          return channel;
        },
      };
      return channel;
    },
    removeChannel: vi.fn(),
  },
}));

vi.mock("@/lib/adCache", () => ({
  adCacheUrl: (id) => `/__ad-cache__/${id}`,
  getDownloadedAdIds: () => Promise.resolve([...state.downloaded]),
  downloadAd: vi.fn(),
  putAd: vi.fn(async (id) => {
    state.downloaded.add(id);
  }),
  deleteAds: vi.fn(async (ids) => ids.forEach((id) => state.downloaded.delete(id))),
}));

// Real schedule rules, minus the tablet's actual clock deciding it's night.
vi.mock("@/lib/time", async (importOriginal) => ({
  ...(await importOriginal()),
  isQuietHours: () => false,
}));

function ad(id, fields = {}) {
  return {
    id,
    title: id,
    file_path: `${id}.mp4`,
    media_type: "video",
    auto_number: null,
    start_date: null,
    end_date: null,
    sort_order: 0,
    active: true,
    ...fields,
  };
}

function startPlayer() {
  localStorage.setItem("smato.autoNumber", "AUTO-01");
  render(<PlayerPage />);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  state.ads = [];
  state.adsQueries = 0;
  state.downloaded = new Set();
  state.broadcastHandlers = {};
  state.subscribeCallback = null;
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(window.HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  downloadAd.mockReset();
  downloadAd.mockResolvedValue({});
  putAd.mockClear();
  deleteAds.mockClear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("player sync", () => {
  it("re-checks the schedule from its saved copy each minute instead of asking the server", async () => {
    state.ads = [ad("a1")];
    startPlayer();
    await vi.waitFor(() => expect(putAd).toHaveBeenCalledWith("a1", expect.anything()));
    const queriesAfterStart = state.adsQueries;

    await act(async () => {
      vi.advanceTimersByTime(10 * 60 * 1000);
    });
    expect(state.adsQueries).toBe(queriesAfterStart);

    // The rare safety-net sync still happens.
    await act(async () => {
      vi.advanceTimersByTime(5 * 60 * 1000);
    });
    await vi.waitFor(() => expect(state.adsQueries).toBe(queriesAfterStart + 1));
  });

  it("catches up on anything missed each time the realtime connection comes back", async () => {
    startPlayer();
    await vi.waitFor(() => expect(state.adsQueries).toBe(1));

    await act(async () => {
      state.subscribeCallback("SUBSCRIBED");
    });
    await vi.waitFor(() => expect(state.adsQueries).toBe(2));
  });

  it("keeps going when one download fails, and retries that one on its own later", async () => {
    state.ads = [ad("a1"), ad("a2")];
    downloadAd.mockImplementation(async (url) => {
      if (url.endsWith("a1.mp4")) throw new TypeError("network connection lost");
      return {};
    });
    startPlayer();
    await vi.waitFor(() => expect(putAd).toHaveBeenCalledWith("a2", expect.anything()));
    expect(putAd).not.toHaveBeenCalledWith("a1", expect.anything());

    downloadAd.mockResolvedValue({});
    await act(async () => {
      vi.advanceTimersByTime(2 * 60 * 1000);
    });
    await vi.waitFor(() => expect(putAd).toHaveBeenCalledWith("a1", expect.anything()));
  });

  it("never downloads the same ad twice when nudges arrive mid-download", async () => {
    state.ads = [ad("a1")];
    let finishDownload;
    downloadAd.mockImplementation(() => new Promise((resolve) => (finishDownload = resolve)));
    startPlayer();
    await vi.waitFor(() => expect(downloadAd).toHaveBeenCalledTimes(1));

    await act(async () => {
      state.broadcastHandlers.changed();
      state.broadcastHandlers.changed();
      state.subscribeCallback("SUBSCRIBED");
      window.dispatchEvent(new Event("online"));
    });
    await act(async () => {
      finishDownload({});
    });

    // All four nudges fold into one follow-up pass, which finds it on disk.
    await vi.waitFor(() => expect(state.adsQueries).toBe(2));
    expect(downloadAd).toHaveBeenCalledTimes(1);
  });

  it("moves on from an image ad after its 2 minutes, despite the once-a-minute schedule check", async () => {
    state.downloaded = new Set(["poster", "clip"]);
    state.ads = [ad("poster", { media_type: "image" }), ad("clip", { sort_order: 1 })];
    localStorage.setItem("smato.autoNumber", "AUTO-01");
    const { container } = render(<PlayerPage />);
    await vi.waitFor(() => expect(container.querySelector(".player__image")).not.toBeNull());

    for (let minute = 0; minute < 3; minute += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60 * 1000);
      });
    }

    expect(container.querySelector(".player__image")).toBeNull();
    expect(container.querySelector("video")).not.toBeNull();
  });

  it("keeps a paused ad's file, but clears deleted and finished ones", async () => {
    state.downloaded = new Set(["live", "paused", "deleted", "finished"]);
    state.ads = [
      ad("live"),
      ad("paused", { active: false }),
      ad("finished", { end_date: "2020-01-01" }),
    ];
    startPlayer();

    await vi.waitFor(() => expect(deleteAds).toHaveBeenCalledTimes(1));
    expect([...deleteAds.mock.calls[0][0]].sort()).toEqual(["deleted", "finished"]);
    expect(downloadAd).not.toHaveBeenCalled();
  });
});
