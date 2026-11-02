import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";

import { FORBIDDEN, graphqlErrorCode } from "../../../core/graphql/errors";
import { queryKeys } from "../../../core/query/keys";
import { toast } from "../../../shared/toast";
import { useAuthStore } from "../../auth/state/useAuthStore";
import { hostOf, isDirectSpace } from "../../relay/state/useRelayStore";
import { myServersQueryOptions, type Server } from "../api/useMyServers";
import { isDeparting, leaveWorkspace } from "../state/memberEvents";

/** Query roots whose refusal with FORBIDDEN means the viewer may no longer be a member. */
const MEMBERSHIP_QUERY_ROOTS = new Set(["channels", "conversations", "unreadCounts"]);

const MY_SERVERS_ROOT = queryKeys.myServers()[0];

/**
 * Drops a workspace that a fetched `myServers` no longer lists although nothing on this client
 * left it or heard of its removal, and says "You are no longer a member of <name>".
 */
function dropVanishedWorkspace(qc: QueryClient, workspaceId: string, name: string): void {
  if (hostOf(workspaceId) || isDirectSpace(workspaceId) || isDeparting(workspaceId)) return;
  leaveWorkspace(qc, workspaceId);
  toast.info(
    name ? `You are no longer a member of ${name}` : "You are no longer a member of this workspace",
    { id: `workspace-access-${workspaceId}` },
  );
}

/**
 * Watches every query of the app for a workspace this account was removed from meanwhile.
 *
 * A FORBIDDEN on a workspace's channel, conversation or unread-count list reads `myServers`
 * again. Whenever a fetched `myServers` lacks a workspace the previous list held, that
 * workspace is dropped with a toast. A removal this client already handled (its own leave, or a
 * `MemberLeft` notice) writes the list itself first, so it never toasts twice.
 */
export function useWorkspaceAccessWatch(): void {
  const qc = useQueryClient();
  useEffect(() => {
    /** The workspaces of the last `myServers` list seen, by id, with their names. */
    let known: Map<string, string> | null = null;
    /** The account `known` belongs to. */
    let knownUser: string | undefined;
    const remember = (servers: Server[] | undefined) => {
      known = servers ? new Map(servers.map((server) => [server.id, server.name])) : null;
      knownUser = useAuthStore.getState().session?.userId;
    };
    remember(qc.getQueryData<Server[]>(queryKeys.myServers()));

    return qc.getQueryCache().subscribe((event) => {
      const [root, workspaceId] = event.query.queryKey;

      if (root === MY_SERVERS_ROOT) {
        if (event.type === "removed") {
          known = null;
          return;
        }
        if (event.type !== "updated" || event.action.type !== "success") return;
        const servers = event.query.state.data as Server[] | undefined;
        const previous = known;
        const sameAccount = knownUser === useAuthStore.getState().session?.userId;
        remember(servers);
        if (event.action.manual || !previous || !servers || !sameAccount) return;
        const listed = new Set(servers.map((server) => server.id));
        for (const [id, name] of previous) {
          if (!listed.has(id)) dropVanishedWorkspace(qc, id, name);
        }
        return;
      }

      if (event.type !== "updated" || event.action.type !== "error") return;
      if (typeof root !== "string" || !MEMBERSHIP_QUERY_ROOTS.has(root)) return;
      if (typeof workspaceId !== "string" || !known?.has(workspaceId)) return;
      if (graphqlErrorCode(event.action.error) !== FORBIDDEN) return;
      // Concurrent refusals share one request: a running fetch is reused.
      void qc.fetchQuery({ ...myServersQueryOptions(), staleTime: 0 }).catch(() => undefined);
    });
  }, [qc]);
}
