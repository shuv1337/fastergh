import PrListDefault from "../../pulls/default";

export default async function PullDetailSidebarPage(props: {
	params: Promise<{ owner: string; name: string; number: string }>;
}) {
	const { owner, name, number } = await props.params;
	const parsed = Number.parseInt(number, 10);
	const activePullNumber = Number.isNaN(parsed) ? null : parsed;
	const repoParams = Promise.resolve({ owner, name });

	return (
		<PrListDefault params={repoParams} activePullNumber={activePullNumber} />
	);
}
