"use client";

import { api } from "@packages/database/convex/_generated/api";
import type { ProjectionQueriesModule } from "@packages/database/convex/rpc/projectionQueries";
import { createRpcModuleClientContext } from "./client-context";

export const {
	RpcClientProvider: ProjectionQueriesProvider,
	useRpcClient: useProjectionQueries,
} = createRpcModuleClientContext<ProjectionQueriesModule>(
	api.rpc.projectionQueries,
);
