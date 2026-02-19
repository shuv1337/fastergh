"use client";

import { Result, useAtom, useAtomValue } from "@effect-atom/atom-react";
import { Button } from "@packages/ui/components/button";
import { Input } from "@packages/ui/components/input";
import { Link } from "@packages/ui/components/link";
import { ScrollArea } from "@packages/ui/components/scroll-area";
import { Skeleton } from "@packages/ui/components/skeleton";
import { UserButton } from "@packages/ui/components/user-button";
import { cn } from "@packages/ui/lib/utils";
import { useProjectionQueries } from "@packages/ui/rpc/projection-queries";
import { useRepoOnboard } from "@packages/ui/rpc/repo-onboard";
import { Option } from "effect";
import { usePathname } from "next/navigation";
import { useMemo, useRef } from "react";

const EmptyPayload: Record<string, never> = {};

export default function SidebarSlot() {
	const pathname = usePathname();
	const segments = pathname.split("/").filter(Boolean);
	const activeOwner = segments[0] ?? null;
	const activeName = segments[1] ?? null;

	const client = useProjectionQueries();
	const reposAtom = useMemo(
		() => client.listRepos.subscription(EmptyPayload),
		[client],
	);
	const reposResult = useAtomValue(reposAtom);

	return (
		<div className="flex h-full flex-col">
			<div className="shrink-0 p-3 border-b">
				<h2 className="text-sm font-semibold text-foreground">Repositories</h2>
				<AddRepoForm />
			</div>
			<ScrollArea className="flex-1 overflow-hidden">
				<div className="p-1">
					{Result.isInitial(reposResult) && (
						<div className="space-y-2 p-2">
							{[1, 2, 3].map((i) => (
								<div key={i} className="space-y-1.5 px-2 py-2">
									<Skeleton className="h-4 w-32" />
									<Skeleton className="h-3 w-20" />
								</div>
							))}
						</div>
					)}

					{(() => {
						const valueOption = Result.value(reposResult);
						if (Option.isNone(valueOption)) return null;
						const repos = valueOption.value;

						if (repos.length === 0) {
							return (
								<p className="px-2 py-4 text-xs text-muted-foreground text-center">
									No repositories connected yet.
								</p>
							);
						}

						return repos.map((repo) => {
							const isActive =
								repo.ownerLogin === activeOwner && repo.name === activeName;
							return (
								<Link
									key={repo.repositoryId}
									href={`/${repo.ownerLogin}/${repo.name}/pulls`}
									className={cn(
										"flex flex-col gap-1 rounded-md px-2.5 py-2 text-sm transition-colors no-underline",
										isActive
											? "bg-accent text-accent-foreground"
											: "text-muted-foreground hover:bg-muted hover:text-foreground",
									)}
								>
									<span className="font-medium text-foreground truncate">
										{repo.fullName}
									</span>
									<div className="flex items-center gap-2 text-[11px]">
										<span>{repo.openPrCount} PRs</span>
										<span>{repo.openIssueCount} issues</span>
										{repo.failingCheckCount > 0 && (
											<span className="text-destructive">
												{repo.failingCheckCount} failing
											</span>
										)}
									</div>
								</Link>
							);
						});
					})()}
				</div>
			</ScrollArea>

			{/* Auth state — pinned to bottom-left */}
			<div className="shrink-0 border-t px-3 py-2">
				<UserButton />
			</div>
		</div>
	);
}

function AddRepoForm() {
	const onboardClient = useRepoOnboard();
	const [addResult, addRepo] = useAtom(onboardClient.addRepoByUrl.call);
	const inputRef = useRef<HTMLInputElement>(null);
	const isLoading = Result.isWaiting(addResult);

	const errorMessage = (() => {
		const err = Result.error(addResult);
		if (Option.isNone(err)) return null;
		const e = err.value;
		if (typeof e === "object" && e !== null && "_tag" in e) {
			const tag = (e as { _tag: string })._tag;
			switch (tag) {
				case "InvalidRepoUrl":
					return "Invalid URL. Use owner/repo format.";
				case "RepoNotFound":
					return "Repository not found on GitHub.";
				case "AlreadyConnected":
					return "Repository is already connected.";
				case "WebhookSetupFailed":
					return "Added, but webhook setup failed.";
				case "RpcDefectError": {
					const defect = (e as { defect: unknown }).defect;
					if (typeof defect === "string") return defect;
					if (
						typeof defect === "object" &&
						defect !== null &&
						"message" in defect
					)
						return String((defect as { message: unknown }).message);
					return "An unexpected error occurred.";
				}
			}
		}
		if (e instanceof Error) return e.message;
		return "Failed to add repository.";
	})();

	const isSuccess =
		Result.isSuccess(addResult) && Option.isSome(Result.value(addResult));

	return (
		<div className="mt-2">
			<form
				className="flex gap-1.5"
				onSubmit={(e) => {
					e.preventDefault();
					const url = inputRef.current?.value.trim();
					if (!url || isLoading) return;
					addRepo({ url });
				}}
			>
				<Input
					ref={inputRef}
					placeholder="owner/repo"
					disabled={isLoading}
					className="h-7 text-xs flex-1"
				/>
				<Button
					type="submit"
					size="sm"
					disabled={isLoading}
					className="h-7 text-xs px-2"
				>
					{isLoading ? "..." : "Add"}
				</Button>
			</form>
			{errorMessage && (
				<p className="mt-1 text-[11px] text-destructive">{errorMessage}</p>
			)}
			{isSuccess && (
				<p className="mt-1 text-[11px] text-green-600">Repository added!</p>
			)}
		</div>
	);
}
