import IssueListDefault from "../default";

export default async function IssueDetailSidebarPage(props: {
	params: Promise<{ owner: string; name: string; number: string }>;
}) {
	const { owner, name, number } = await props.params;
	const parsed = Number.parseInt(number, 10);
	const activeIssueNumber = Number.isNaN(parsed) ? null : parsed;
	const repoParams = Promise.resolve({ owner, name });

	return (
		<IssueListDefault
			params={repoParams}
			activeIssueNumber={activeIssueNumber}
		/>
	);
}
