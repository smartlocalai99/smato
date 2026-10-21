import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import InstallApp from "@/components/admin/InstallApp";

function standalone(matches) {
  window.matchMedia = vi.fn(() => ({ matches }));
}

afterEach(() => {
  cleanup();
  delete window.matchMedia;
});

describe("InstallApp", () => {
  it("is hidden when already running from the home screen", () => {
    standalone(true);
    render(<InstallApp />);

    expect(screen.queryByRole("button", { name: "Install app" })).not.toBeInTheDocument();
  });

  it("opens the browser's install dialog when one is available", async () => {
    standalone(false);
    render(<InstallApp />);
    const event = new Event("beforeinstallprompt");
    event.prompt = vi.fn();
    event.userChoice = Promise.resolve({ outcome: "accepted" });
    act(() => {
      window.dispatchEvent(event);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Install app" }));
    });

    expect(event.prompt).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("explains how to add it to the home screen when the browser has no dialog", () => {
    standalone(false);
    render(<InstallApp />);

    fireEvent.click(screen.getByRole("button", { name: "Install app" }));

    expect(screen.getByRole("dialog", { name: "Add smato to your home screen" })).toBeInTheDocument();
    expect(screen.getByText("Add to Home screen")).toBeInTheDocument();
  });
});
