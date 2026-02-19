"use client";

import { api } from "@packages/database/convex/_generated/api";
import type { GithubWriteModule } from "@packages/database/convex/rpc/githubWrite";
import { createRpcModuleClientContext } from "./client-context";

export const {
	RpcClientProvider: GithubWriteProvider,
	useRpcClient: useGithubWrite,
} = createRpcModuleClientContext<GithubWriteModule>(api.rpc.githubWrite);
