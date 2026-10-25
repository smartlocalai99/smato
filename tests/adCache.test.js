// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadAd } from "@/lib/adCache";

const FILE = Uint8Array.from({ length: 100 }, (_, i) => i);

// A response carrying `bytes` — or, with `cutAfter`, one whose connection
// drops after that many bytes have arrived, the way a weak mobile signal does.
function respond(bytes, { status = 200, cutAfter = null } = {}) {
  let delivered = false;
  const body = new ReadableStream({
    pull(controller) {
      if (!delivered) {
        delivered = true;
        controller.enqueue(cutAfter == null ? bytes : bytes.slice(0, cutAfter));
      } else if (cutAfter == null) {
        controller.close();
      } else {
        controller.error(new TypeError("network connection lost"));
      }
    },
  });
  return new Response(body, {
    status,
    headers: { "Content-Type": "video/mp4", "Content-Length": String(bytes.length) },
  });
}

async function bytesOf(response) {
  return new Uint8Array(await response.arrayBuffer());
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("downloadAd", () => {
  it("picks up where a dropped download left off instead of starting over", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(respond(FILE, { cutAfter: 60 }))
      .mockResolvedValueOnce(respond(FILE.slice(60), { status: 206 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await downloadAd("https://storage.test/resume.mp4", { retryDelayMs: 0 });

    expect(await bytesOf(response)).toEqual(FILE);
    expect(response.headers.get("Content-Type")).toBe("video/mp4");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]).toEqual({ headers: { Range: "bytes=60-" } });
  });

  it("starts over cleanly when the server ignores the resume request", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(respond(FILE, { cutAfter: 60 }))
        .mockResolvedValueOnce(respond(FILE))
    );

    const response = await downloadAd("https://storage.test/restart.mp4", { retryDelayMs: 0 });

    expect(await bytesOf(response)).toEqual(FILE);
  });

  it("keeps what it already has for the next sync when every attempt fails", async () => {
    const url = "https://storage.test/later.mp4";
    const offline = new TypeError("Failed to fetch");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(respond(FILE, { cutAfter: 30 }))
        .mockRejectedValueOnce(offline)
        .mockRejectedValueOnce(offline)
    );
    await expect(downloadAd(url, { retryDelayMs: 0 })).rejects.toBe(offline);

    const fetchMock = vi.fn().mockResolvedValueOnce(respond(FILE.slice(30), { status: 206 }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await downloadAd(url, { retryDelayMs: 0 });

    expect(fetchMock.mock.calls[0][1]).toEqual({ headers: { Range: "bytes=30-" } });
    expect(await bytesOf(response)).toEqual(FILE);
  });

  it("gives up on a file the server refuses, without keeping any of it", async () => {
    const url = "https://storage.test/missing.mp4";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not found", { status: 404 })));
    await expect(downloadAd(url, { retryDelayMs: 0 })).rejects.toThrow("404");

    const fetchMock = vi.fn().mockResolvedValueOnce(respond(FILE));
    vi.stubGlobal("fetch", fetchMock);
    await downloadAd(url, { retryDelayMs: 0 });
    expect(fetchMock.mock.calls[0][1]).toBeUndefined();
  });
});
