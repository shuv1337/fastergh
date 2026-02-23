import ActionsListDefault from "../../default";

export default async function ActionRunSidebarPage(props: {
	params: Promise<{ owner: string; name: string; runId: string }>;
}) {
	const { owner, name, runId } = await props.params;
	const parsed = Number.parseInt(runId, 10);
	const activeRunNumber = Number.isNaN(parsed) ? null : parsed;
	const repoParams = Promise.resolve({ owner, name });

	return (
		<ActionsListDefault params={repoParams} activeRunNumber={activeRunNumber} />
	);
}
