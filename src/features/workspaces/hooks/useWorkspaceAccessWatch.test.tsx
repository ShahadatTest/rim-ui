import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, type QueryKey } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { queryKeys } from "../../../core/query/keys";
import { useWorkspaceStore } from "../state/useWorkspaceStore";
import { myServersQueryOptions, type Server } from "../api/useMyServers";
import { expectDeparture, forgetDeparture } from "../state/memberEvents";

const requestMock = vi.hoisted(() => vi.fn());
vi.mock("../../../core/graphql/client", () => ({
  graphqlClient: { request: (...args: unknown[]) => requestMock(...args) },
}));

vi.mock("../../../shared/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn(), dismiss: vi.fn() },
}));

import { toast } from "../../../shared/toast";
import { useWorkspaceAccessWatch } from "./useWorkspaceAccessWatch";

const ONE: Server = { id: "ws-1", name: "One", owner: null };
const TWO: Server = { id: "ws-2", name: "Two", owner: null };

function refusal(code: string) {
  return { response: { errors: [{ message: "permission denied", extensions: { code } }] } };
}

const forbidden = refusal("FORBIDDEN");

/** Makes the query at `queryKey` fail with `error`, as a refused request does. */
function refuse(qc: QueryClient, queryKey: QueryKey, error: unknown = forbidden): Promise<void> {
  return qc.fetchQuery({ queryKey, queryFn: () => Promise.reject(error) }).then(
    () => undefined,
    () => undefined,
  );
}

/** The `MyServers` requests sent so far. */
function myServersRequests(): unknown[][] {
  return requestMock.mock.calls.filter(([document]) => String(document).includes("MyServers"));
}

let client: QueryClient | undefined;

/** A client whose `myServers` stays cached without an observer, as the rail keeps it. */
function setup(): QueryClient {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client = qc;
  qc.setQueryData(queryKeys.myServers(), [ONE, TWO]);
  renderHook(() => useWorkspaceAccessWatch(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  });
  return qc;
}

function answerMyServers(servers: Server[]): void {
  requestMock.mockImplementation(async (document: unknown) => {
    if (String(document).includes("MyServers")) return { myServers: servers };
    throw new Error(`unexpected request: ${String(document)}`);
  });
}

beforeEach(() => {
  requestMock.mockReset();
  vi.mocked(toast.info).mockClear();
  useWorkspaceStore.setState({ workspaceId: "ws-1" });
});

afterEach(() => {
  client?.clear();
  useWorkspaceStore.setState({ workspaceId: null });
});

describe("useWorkspaceAccessWatch", () => {
  it("drops a workspace the server no longer lists and says so", async () => {
    answerMyServers([ONE]);
    const qc = setup();

    await refuse(qc, queryKeys.unreadCounts("ws-2"));

    await waitFor(() =>
      expect(toast.info).toHaveBeenCalledWith(
        "You are no longer a member of Two",
        expect.objectContaining({ id: "workspace-access-ws-2" }),
      ),
    );
    expect(qc.getQueryData<Server[]>(queryKeys.myServers())?.map((s) => s.id)).toEqual(["ws-1"]);
    expect(useWorkspaceStore.getState().workspaceId).toBe("ws-1");
  });

  it("clears the selection when the dropped workspace is open", async () => {
    answerMyServers([ONE]);
    useWorkspaceStore.setState({ workspaceId: "ws-2" });
    const qc = setup();

    await refuse(qc, queryKeys.joinedChannels("ws-2"));

    await waitFor(() => expect(useWorkspaceStore.getState().workspaceId).toBeNull());
    expect(toast.info).toHaveBeenCalledTimes(1);
  });

  it("leaves a workspace dropped during the request to its own notice", async () => {
    const qc = setup();
    requestMock.mockImplementation(async (document: unknown) => {
      if (!String(document).includes("MyServers")) throw new Error("unexpected request");
      // The removal notice drops the workspace while the request is out.
      qc.setQueryData<Server[]>(queryKeys.myServers(), [ONE]);
      return { myServers: [ONE] };
    });

    await refuse(qc, queryKeys.unreadCounts("ws-2"));

    await waitFor(() => expect(myServersRequests()).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("keeps a workspace the server still lists", async () => {
    answerMyServers([ONE, TWO]);
    const qc = setup();

    await refuse(qc, queryKeys.unreadCounts("ws-2"));

    await waitFor(() => expect(myServersRequests()).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(toast.info).not.toHaveBeenCalled();
    expect(qc.getQueryData<Server[]>(queryKeys.myServers())?.map((s) => s.id)).toEqual([
      "ws-1",
      "ws-2",
    ]);
  });

  it("ignores other errors and other queries", async () => {
    answerMyServers([ONE]);
    const qc = setup();

    await refuse(qc, queryKeys.unreadCounts("ws-2"), refusal("RATE_LIMITED"));
    await refuse(qc, ["serverMembers", "ws-2"]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(myServersRequests()).toHaveLength(0);
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("checks once for several refusals", async () => {
    answerMyServers([ONE]);
    const qc = setup();

    await Promise.all([
      refuse(qc, queryKeys.unreadCounts("ws-2")),
      refuse(qc, queryKeys.channels("ws-2")),
      refuse(qc, queryKeys.conversations("ws-2")),
    ]);

    await waitFor(() => expect(toast.info).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(myServersRequests()).toHaveLength(1);
    expect(toast.info).toHaveBeenCalledTimes(1);
  });

  it("says so when any refetch of the list drops a workspace", async () => {
    answerMyServers([ONE]);
    useWorkspaceStore.setState({ workspaceId: "ws-2" });
    const qc = setup();

    await qc.fetchQuery({ ...myServersQueryOptions(), staleTime: 0 });

    await waitFor(() =>
      expect(toast.info).toHaveBeenCalledWith(
        "You are no longer a member of Two",
        expect.objectContaining({ id: "workspace-access-ws-2" }),
      ),
    );
    expect(useWorkspaceStore.getState().workspaceId).toBeNull();
  });

  it("stays quiet about a workspace this client is leaving", async () => {
    answerMyServers([ONE]);
    const qc = setup();
    expectDeparture("ws-2");
    try {
      await qc.fetchQuery({ ...myServersQueryOptions(), staleTime: 0 });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(toast.info).not.toHaveBeenCalled();
    } finally {
      forgetDeparture("ws-2");
    }
  });

  it("stays quiet about the first list after the cache is cleared", async () => {
    answerMyServers([ONE]);
    const qc = setup();
    qc.clear();

    await qc.fetchQuery({ ...myServersQueryOptions(), staleTime: 0 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(toast.info).not.toHaveBeenCalled();
  });
});
