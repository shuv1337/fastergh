"use client";

import { api } from "@packages/database/convex/_generated/api";
import type { CodeBrowseModule } from "@packages/database/convex/rpc/codeBrowse";
import { createRpcModuleClientContext } from "./client-context";

export const {
	RpcClientProvider: CodeBrowseProvider,
	useRpcClient: useCodeBrowse,
	getDefaultRpcClient: getCodeBrowseClient,
} = createRpcModuleClientContext<CodeBrowseModule>(api.rpc.codeBrowse);
