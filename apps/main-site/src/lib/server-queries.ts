import "server-only";

import { createServerRpcQuery } from "@packages/confect/rpc";
import { api } from "@packages/database/convex/_generated/api";
import type { ProjectionQueriesModule } from "@packages/database/convex/rpc/projectionQueries";

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL ?? "";

export const serverQueries = createServerRpcQuery<ProjectionQueriesModule>(
	api.rpc.projectionQueries,
	{ url: CONVEX_URL },
);
