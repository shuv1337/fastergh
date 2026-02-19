import { Suspense } from "react";
import { serverQueries } from "@/lib/server-queries";
import { IssueDetailSkeleton } from "../../../../../_components/skeletons";
import { IssueDetailClient } from "./issue-detail-client";

export default function IssueDetailSlot(props: {
	params: Promise<{ owner: string; name: string; number: string }>;
}) {
	return (
		<Suspense fallback={<IssueDetailSkeleton />}>
			<IssueDetailContent paramsPromise={props.params} />
		</Suspense>
	);
}

async function IssueDetailContent({
	paramsPromise,
}: {
	paramsPromise: Promise<{ owner: string; name: string; number: string }>;
}) {
	const params = await paramsPromise;
	const { owner, name } = params;
	const num = Number.parseInt(params.number, 10);

	const initialIssue = await serverQueries.getIssueDetail.queryPromise({
		ownerLogin: owner,
		name,
		number: num,
	});

	return (
		<IssueDetailClient
			owner={owner}
			name={name}
			issueNumber={num}
			initialIssue={initialIssue}
		/>
	);
}
