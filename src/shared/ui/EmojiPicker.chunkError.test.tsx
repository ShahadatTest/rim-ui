import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("@emoji-mart/react", () => ({
  default: () => {
    throw new TypeError(
      "Failed to fetch dynamically imported module: https://rim.test/assets/native-x.js",
    );
  },
}));

vi.mock("@emoji-mart/data", () => ({ default: {} }));

vi.mock("../media/serverMedia", () => ({
  useServerMediaUrls: (urls: readonly string[]) => new Map(urls.map((u) => [u, u])),
}));

import { EmojiPicker } from "./EmojiPicker";
import { SurfaceErrorBoundary } from "./SurfaceErrorBoundary";

describe("EmojiPicker chunk failure", () => {
  it("keeps a failed chunk inside the picker", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <SurfaceErrorBoundary surface="Conversation">
        <p>timeline</p>
        <EmojiPicker position={{ x: 0, y: 0 }} onSelect={vi.fn()} onClose={vi.fn()} />
      </SurfaceErrorBoundary>,
    );
    const message = await screen.findByText("This part of the app could not load");
    expect(
      within(screen.getByRole("dialog", { name: "Emoji picker" })).getByText(
        message.textContent ?? "",
      ),
    ).toBe(message);
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect(screen.getByText("timeline")).toBeInTheDocument();
  });
});
