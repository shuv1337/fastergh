"use client";

import { api } from "@packages/database/convex/_generated/api";
import type { IssueTemplatesModule } from "@packages/database/convex/rpc/issueTemplates";
import { createRpcModuleClientContext } from "./client-context";

export const {
	RpcClientProvider: IssueTemplatesProvider,
	useRpcClient: useIssueTemplates,
	getDefaultRpcClient: getIssueTemplatesClient,
} = createRpcModuleClientContext<IssueTemplatesModule>(api.rpc.issueTemplates);
