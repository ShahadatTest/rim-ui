import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { UserHoverCard } from "./UserHoverCard";
import { useContextMenu } from "./contextMenu/useContextMenu";

describe("UserHoverCard", () => {
  const defaultProps = {
    userId: "user-1",
    username: "hoveruser",
    displayName: "Hover User",
  };

  it("renders children", () => {
    render(
      <UserHoverCard {...defaultProps}>
        <span>Trigger</span>
      </UserHoverCard>,
    );
    expect(screen.getByText("Trigger")).toBeInTheDocument();
  });

  it("does not show card initially", () => {
    render(
      <UserHoverCard {...defaultProps}>
        <span>Trigger</span>
      </UserHoverCard>,
    );
    expect(screen.queryByText("@hoveruser")).not.toBeInTheDocument();
  });

  it("shows card after hover delay", async () => {
    vi.useFakeTimers();
    render(
      <UserHoverCard {...defaultProps}>
        <span>Trigger</span>
      </UserHoverCard>,
    );

    fireEvent.mouseEnter(screen.getByText("Trigger"));
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.getByText("@hoveruser")).toBeInTheDocument();
    expect(screen.getByText("Hover User")).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("hides card after mouse leave with grace period", async () => {
    vi.useFakeTimers();
    render(
      <UserHoverCard {...defaultProps}>
        <span>Trigger</span>
      </UserHoverCard>,
    );

    fireEvent.mouseEnter(screen.getByText("Trigger"));
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByText("@hoveruser")).toBeInTheDocument();

    fireEvent.mouseLeave(screen.getByText("Trigger"));
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByText("@hoveruser")).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  describe("with a context menu", () => {
    function Harness() {
      const menu = useContextMenu();
      return (
        <>
          <UserHoverCard {...defaultProps}>
            <span {...menu.bind(() => [{ id: "dm", label: "Send message", onSelect: vi.fn() }])}>
              Trigger
            </span>
          </UserHoverCard>
          {menu.menu}
        </>
      );
    }

    afterEach(() => {
      vi.useRealTimers();
    });

    it("closes the card when a context menu opens", () => {
      vi.useFakeTimers();
      render(<Harness />);
      const trigger = screen.getByText("Trigger");
      fireEvent.mouseEnter(trigger);
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(screen.getByText("@hoveruser")).toBeInTheDocument();

      fireEvent.contextMenu(trigger);

      expect(screen.queryByText("@hoveruser")).not.toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: "Send message" })).toBeInTheDocument();
    });

    it("opens no card while a context menu is open", () => {
      vi.useFakeTimers();
      render(<Harness />);
      const trigger = screen.getByText("Trigger");
      fireEvent.mouseEnter(trigger);
      fireEvent.contextMenu(trigger);
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(screen.queryByText("@hoveruser")).not.toBeInTheDocument();

      fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
      fireEvent.mouseLeave(trigger);
      fireEvent.mouseEnter(trigger);
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(screen.getByText("@hoveruser")).toBeInTheDocument();
    });
  });
});
