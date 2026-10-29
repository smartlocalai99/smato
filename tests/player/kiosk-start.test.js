import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import PlayerPage from "@/app/player/page";

vi.mock("@/lib/supabase", () => ({
  ADS_CHANNEL_NAME: "test-ads",
  adFileUrl: vi.fn(),
  supabase: {
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        or: () => query,
        upsert: () => Promise.resolve({ error: null }),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        then: (resolve, reject) =>
          Promise.resolve({ data: [], error: null }).then(resolve, reject),
      };
      return query;
    },
    channel: () => {
      const channel = { on: () => channel, subscribe: () => channel };
      return channel;
    },
    removeChannel: vi.fn(),
  },
}));

vi.mock("@/lib/adCache", () => ({
  adCacheUrl: (id) => `/__ad-cache__/${id}`,
  getDownloadedAdIds: () => Promise.resolve([]),
  putAd: vi.fn(),
  deleteAds: vi.fn(),
  downloadAd: vi.fn(),
}));

vi.mock("@/lib/time", () => ({
  adsForAuto: (ads) => ads,
  isAdActiveNow: () => true,
  hasCampaignEnded: () => false,
  isQuietHours: () => false,
}));

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  window.AndroidNative = { onPlayerReady: vi.fn() };
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete window.AndroidNative;
  vi.restoreAllMocks();
});

describe("automatic kiosk entry", () => {
  it("leaves the auto-name setup unlocked, including an empty submission", async () => {
    render(<PlayerPage />);
    const input = await screen.findByLabelText("Auto number");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.submit(screen.getByRole("button", { name: "Save & start playing" }).closest("form"));

    expect(screen.getByText("Which auto is this?")).toBeInTheDocument();
    expect(window.AndroidNative.onPlayerReady).not.toHaveBeenCalled();
  });

  it("requests locking after saving an auto and opening content, even offline with no ads", async () => {
    render(<PlayerPage />);
    fireEvent.change(await screen.findByLabelText("Auto number"), {
      target: { value: " auto-09 " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save & start playing" }));

    await waitFor(() => expect(window.AndroidNative.onPlayerReady).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem("smato.autoNumber")).toBe("AUTO-09");
    expect(screen.queryByText("Which auto is this?")).not.toBeInTheDocument();
  });

  it("requests locking again when a saved auto is restored after reopening", async () => {
    localStorage.setItem("smato.autoNumber", "AUTO-02");
    const first = render(<PlayerPage />);
    await waitFor(() => expect(window.AndroidNative.onPlayerReady).toHaveBeenCalledTimes(1));
    first.unmount();
    render(<PlayerPage />);

    await waitFor(() => expect(window.AndroidNative.onPlayerReady).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Which auto is this?")).not.toBeInTheDocument();
  });

  it("lets a tablet set up with the wrong number be changed from the corner panel", async () => {
    localStorage.setItem("smato.autoNumber", "AUTO-02");
    localStorage.setItem("smato.lastAdsSnapshot", JSON.stringify([{ id: "old" }]));
    const { container } = render(<PlayerPage />);
    await waitFor(() => expect(container.querySelector(".player")).not.toBeNull());

    const corner = container.querySelector(".player__tap-zone");
    for (let i = 0; i < 5; i += 1) fireEvent.click(corner);
    fireEvent.click(screen.getByRole("button", { name: "Change auto number" }));

    const input = screen.getByLabelText("Auto number");
    expect(input).toHaveValue("AUTO-02");
    fireEvent.change(input, { target: { value: "auto-05" } });
    fireEvent.click(screen.getByRole("button", { name: "Save & start playing" }));

    await waitFor(() => expect(container.querySelector(".player")).not.toBeNull());
    expect(localStorage.getItem("smato.autoNumber")).toBe("AUTO-05");
    expect(localStorage.getItem("smato.lastAdsSnapshot")).toBeNull();
  });

  it("keeps the old number when changing it is cancelled", async () => {
    localStorage.setItem("smato.autoNumber", "AUTO-02");
    const { container } = render(<PlayerPage />);
    await waitFor(() => expect(container.querySelector(".player")).not.toBeNull());

    const corner = container.querySelector(".player__tap-zone");
    for (let i = 0; i < 5; i += 1) fireEvent.click(corner);
    fireEvent.click(screen.getByRole("button", { name: "Change auto number" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel, keep AUTO-02" }));

    await waitFor(() => expect(container.querySelector(".player")).not.toBeNull());
    expect(localStorage.getItem("smato.autoNumber")).toBe("AUTO-02");
  });

  it.each([undefined, {}, { onPlayerReady: () => { throw new Error("bridge unavailable"); } }])(
    "still opens content when the native readiness bridge is unavailable",
    async (bridge) => {
      window.AndroidNative = bridge;
      localStorage.setItem("smato.autoNumber", "AUTO-03");
      const { container } = render(<PlayerPage />);

      await waitFor(() => expect(container.querySelector(".player")).not.toBeNull());
      expect(screen.queryByText("Which auto is this?")).not.toBeInTheDocument();
    }
  );
});
