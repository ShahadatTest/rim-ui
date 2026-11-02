import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";

import { FORBIDDEN, graphqlErrorCode } from "../../../core/graphql/errors";
import { queryKeys } from "../../../core/query/keys";
import { toast } from "../../../shared/toast";
import { hostOf, isDirectSpace } from "../../relay/state/useRelayStore";
import { fetchMyServers, type Server } from "../api/useMyServers";
import { isDeparting, leaveWorkspace } from "../state/memberEvents";

/** Query roots whose refusal with FORBIDDEN means the viewer may no longer be a member. */
const MEMBERSHIP_QUERY_ROOTS = new Set(["channels", "conversations", "unreadCounts"]);

/** Workspaces being checked, so that several refused queries check once. */
const checking = new Set<string>();

/**
 * Checks a workspace whose list the server refused: when `myServers`, read again, no longer
 * lists it, drops it like a removal and says "You are no longer a member of <name>".
 */
export async function checkWorkspaceAccess(qc: QueryClient, workspaceId: string): Promise<void> {
  if (checking.has(workspaceId)) return;
  if (hostOf(workspaceId) || isDirectSpace(workspaceId)) return;
  const cached = qc
    .getQueryData<Server[]>(queryKeys.myServers())
    ?.find((server) => server.id === workspaceId);
  if (!cached) return;
  const name = cached.name;

  checking.add(workspaceId);
  let servers: Server[];
  try {
    servers = await fetchMyServers();
  } catch {
    return;
  } finally {
    checking.delete(workspaceId);
  }

  if (servers.some((server) => server.id === workspaceId) || isDeparting(workspaceId)) return;
  // A removal notice that arrived during the request already dropped it and said so.
  const stillCached = qc
    .getQueryData<Server[]>(queryKeys.myServers())
    ?.some((server) => server.id === workspaceId);
  if (!stillCached) return;
  leaveWorkspace(qc, workspaceId);
  toast.info(
    name ? `You are no longer a member of ${name}` : "You are no longer a member of this workspace",
    { id: `workspace-access-${workspaceId}` },
  );
}

/** Watches every query of the app for a workspace this account was removed from meanwhile. */
export function useWorkspaceAccessWatch(): void {
  const qc = useQueryClient();
  useEffect(
    () =>
      qc.getQueryCache().subscribe((event) => {
        if (event.type !== "updated" || event.action.type !== "error") return;
        const [root, workspaceId] = event.query.queryKey;
        if (typeof root !== "string" || !MEMBERSHIP_QUERY_ROOTS.has(root)) return;
        if (typeof workspaceId !== "string") return;
        if (graphqlErrorCode(event.action.error) !== FORBIDDEN) return;
        void checkWorkspaceAccess(qc, workspaceId);
      }),
    [qc],
  );
}
