import { afterEach, describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import { useKeybindProfileStore } from "../../features/commands/state/useKeybindProfileStore";
import { trackOpenDialog } from "../../shared/ui/hostDialogs";
import { useShellStore } from "../state/useShellStore";
import { useGlobalKeyHandlers } from "./useGlobalKeyHandlers";

function Harness() {
  useGlobalKeyHandlers();
  return <textarea data-composer-input aria-label="composer" />;
}

function typeOutsideAField(key: string) {
  document.body.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
}

describe("useGlobalKeyHandlers", () => {
  afterEach(() => {
    useKeybindProfileStore.getState().setVimMode(false);
    useShellStore.getState().reset();
  });

  it("sends a printable key typed outside a field to the composer", () => {
    const { getByRole } = render(<Harness />);
    typeOutsideAField("x");
    expect(getByRole("textbox")).toHaveFocus();
  });

  it("leaves keys alone in Vim mode, where they are normal-mode commands", () => {
    useKeybindProfileStore.getState().setVimMode(true);
    const { getByRole } = render(<Harness />);
    typeOutsideAField("x");
    expect(getByRole("textbox")).not.toHaveFocus();
  });

  it("leaves a typed key alone while a host dialog is open", () => {
    const { getByRole } = render(
      <>
        <Harness />
        <button>Cancel</button>
      </>,
    );
    const button = getByRole("button", { name: "Cancel" });
    button.focus();
    const release = trackOpenDialog();
    try {
      button.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
      expect(getByRole("textbox")).not.toHaveFocus();
      expect(button).toHaveFocus();
    } finally {
      release();
    }
  });

  it("leaves zen mode on when Escape belongs to a host dialog", () => {
    useShellStore.setState({ zenMode: true });
    render(<Harness />);
    const release = trackOpenDialog();
    try {
      typeOutsideAField("Escape");
      expect(useShellStore.getState().zenMode).toBe(true);
    } finally {
      release();
    }
  });
});
