import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PipelineResultView } from "./PipelineResultView";
import type { PipeStageResult } from "../types";

function makeStage(overrides: Partial<PipeStageResult> = {}): PipeStageResult {
  return {
    stageIndex: 0,
    commandId: "test.command",
    status: "SUCCESS",
    message: "OK",
    payload: null,
    ...overrides,
  };
}

describe("PipelineResultView", () => {
  it("renders nothing for empty stages", () => {
    const { container } = render(<PipelineResultView stages={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders all stages on success", () => {
    const stages: PipeStageResult[] = [
      makeStage({ stageIndex: 0, commandId: "cmd.a", message: "Stage A done" }),
      makeStage({ stageIndex: 1, commandId: "cmd.b", message: "Stage B done" }),
      makeStage({ stageIndex: 2, commandId: "cmd.c", message: "Stage C done" }),
    ];

    render(<PipelineResultView stages={stages} />);

    expect(screen.getByTestId("pipeline-result-view")).toBeTruthy();
    expect(screen.getByTestId("pipeline-stage-0")).toBeTruthy();
    expect(screen.getByTestId("pipeline-stage-1")).toBeTruthy();
    expect(screen.getByTestId("pipeline-stage-2")).toBeTruthy();
    expect(screen.getByText("cmd.a")).toBeTruthy();
    expect(screen.getByText("cmd.b")).toBeTruthy();
    expect(screen.getByText("cmd.c")).toBeTruthy();
    expect(screen.getByText("Stage A done")).toBeTruthy();
  });

  it("renders failed stage with error styling", () => {
    const stages: PipeStageResult[] = [
      makeStage({ stageIndex: 0, commandId: "cmd.a", status: "SUCCESS", message: "OK" }),
      makeStage({ stageIndex: 1, commandId: "cmd.b", status: "ERROR", message: "Failed here" }),
    ];

    render(<PipelineResultView stages={stages} />);

    const failedStage = screen.getByTestId("pipeline-stage-1");
    expect(failedStage.className).toContain("rim-danger");
    expect(screen.getByText("Failed here")).toBeTruthy();

    // Succeeded stage should not have error styling
    const successStage = screen.getByTestId("pipeline-stage-0");
    expect(successStage.className).not.toContain("rim-danger");
  });

  it("renders backtick-quoted arg names as code on error stages", () => {
    const stages: PipeStageResult[] = [
      makeStage({
        stageIndex: 0,
        commandId: "admin.kick",
        status: "ERROR",
        message: "missing string arg `user_id`",
      }),
    ];

    const { container } = render(<PipelineResultView stages={stages} />);
    const code = container.querySelector("code");
    expect(code).not.toBeNull();
    expect(code?.textContent).toBe("user_id");
    expect(screen.getByText("missing string arg", { exact: false }).textContent).toBe(
      "missing string arg user_id",
    );
  });

  it("keeps backticks as written on success stage messages", () => {
    const stages: PipeStageResult[] = [
      makeStage({
        stageIndex: 0,
        commandId: "cmd.ok",
        status: "SUCCESS",
        message: "wrote `notes.md`",
      }),
    ];

    const { container } = render(<PipelineResultView stages={stages} />);
    expect(container.querySelector("code")).toBeNull();
    expect(screen.getByText("wrote `notes.md`")).toBeTruthy();
  });

  it("renders a single stage", () => {
    const stages: PipeStageResult[] = [
      makeStage({ stageIndex: 0, commandId: "solo.cmd", message: "Solo result" }),
    ];

    render(<PipelineResultView stages={stages} />);

    expect(screen.getByTestId("pipeline-stage-0")).toBeTruthy();
    expect(screen.getByText("solo.cmd")).toBeTruthy();
  });

  it("renders middle stage failure with partial results", () => {
    const stages: PipeStageResult[] = [
      makeStage({ stageIndex: 0, commandId: "cmd.first", status: "SUCCESS", message: "First OK" }),
      makeStage({
        stageIndex: 1,
        commandId: "cmd.middle",
        status: "ERROR",
        message: 'Failed: previous stage produced: {"keys": ["a","b"]}',
      }),
    ];

    render(<PipelineResultView stages={stages} />);

    // First stage succeeded
    const firstStage = screen.getByTestId("pipeline-stage-0");
    expect(firstStage.className).not.toContain("rim-danger");

    // Middle stage failed
    const middleStage = screen.getByTestId("pipeline-stage-1");
    expect(middleStage.className).toContain("rim-danger");
    expect(screen.getByText(/previous stage produced/)).toBeTruthy();
  });

  it("shows collapsible payload when present", () => {
    const stages: PipeStageResult[] = [
      makeStage({
        stageIndex: 0,
        commandId: "cmd.with-payload",
        payload: { result: "data", count: 42 },
      }),
    ];

    render(<PipelineResultView stages={stages} />);

    // Payload toggle button should be present
    const toggle = screen.getByText("payload");
    expect(toggle).toBeTruthy();

    // Payload content should not be visible initially
    expect(screen.queryByText(/"result"/)).toBeNull();

    // Click to expand
    fireEvent.click(toggle);
    expect(screen.getByText(/"result"/)).toBeTruthy();
    expect(screen.getByText(/"count"/)).toBeTruthy();
  });

  it("does not show payload toggle when payload is null", () => {
    const stages: PipeStageResult[] = [makeStage({ stageIndex: 0, payload: null })];

    render(<PipelineResultView stages={stages} />);

    expect(screen.queryByText("payload")).toBeNull();
  });
});
