import { Suspense } from "react";
import { serverQueries } from "@/lib/server-queries";
import { PrDetailSkeleton } from "../../../../../_components/skeletons";
import { RunDetailClient } from "./run-detail-client";

export default function RunDetailSlot(props: {
	params: Promise<{ owner: string; name: string; runNumber: string }>;
}) {
	return (
		<Suspense fallback={<PrDetailSkeleton />}>
			<RunDetailContent paramsPromise={props.params} />
		</Suspense>
	);
}

async function RunDetailContent({
	paramsPromise,
}: {
	paramsPromise: Promise<{ owner: string; name: string; runNumber: string }>;
}) {
	const params = await paramsPromise;
	const { owner, name } = params;
	const runNumber = Number.parseInt(params.runNumber, 10);

	const initialRun = await serverQueries.getWorkflowRunDetail.queryPromise({
		ownerLogin: owner,
		name,
		runNumber,
	});

	return (
		<RunDetailClient
			owner={owner}
			name={name}
			runNumber={runNumber}
			initialRun={initialRun}
		/>
	);
}
