"use client";

import { api } from "@packages/database/convex/_generated/api";
import type { RepoOnboardModule } from "@packages/database/convex/rpc/repoOnboard";
import { createRpcModuleClientContext } from "./client-context";

export const {
	RpcClientProvider: RepoOnboardProvider,
	useRpcClient: useRepoOnboard,
} = createRpcModuleClientContext<RepoOnboardModule>(api.rpc.repoOnboard);
