"use client";

import { Result, useAtom } from "@effect-atom/atom-react";
import { useSubscriptionWithInitial } from "@packages/confect/rpc";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@packages/ui/components/avatar";
import { Badge } from "@packages/ui/components/badge";
import { Button } from "@packages/ui/components/button";
import { Card, CardContent, CardHeader } from "@packages/ui/components/card";
import { Separator } from "@packages/ui/components/separator";
import { Textarea } from "@packages/ui/components/textarea";
import { useGithubWrite } from "@packages/ui/rpc/github-write";
import { useProjectionQueries } from "@packages/ui/rpc/projection-queries";
import { use, useId, useMemo, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ---------------------------------------------------------------------------
// Types — inferred from the server RPC return types
// ---------------------------------------------------------------------------

import type { serverQueries } from "@/lib/server-queries";

type IssueDetail = NonNullable<
	Awaited<ReturnType<(typeof serverQueries)["getIssueDetail"]["queryPromise"]>>
>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelative(timestamp: number): string {
	const diff = Math.floor((Date.now() - timestamp) / 1000);
	if (diff < 60) return "just now";
	if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
	if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
	if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
	return new Date(timestamp).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

function formatDate(timestamp: number): string {
	return new Date(timestamp).toLocaleDateString(undefined, {
		year: "numeric",
		month: "long",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

// ---------------------------------------------------------------------------
// Issue detail client component
// ---------------------------------------------------------------------------

export function IssueDetailClient({
	owner,
	name,
	issueNumber,
	initialDataPromise,
}: {
	owner: string;
	name: string;
	issueNumber: number;
	initialDataPromise: Promise<IssueDetail | null>;
}) {
	// use() suspends until the server-fetched promise resolves
	const initialData = use(initialDataPromise);

	// Real-time subscription — falls back to server data until connected
	const client = useProjectionQueries();
	const issueAtom = useMemo(
		() =>
			client.getIssueDetail.subscription({
				ownerLogin: owner,
				name,
				number: issueNumber,
			}),
		[client, owner, name, issueNumber],
	);
	const issue = useSubscriptionWithInitial(issueAtom, initialData);

	if (issue === null) {
		return (
			<>
				<h1 className="text-2xl font-bold">Issue #{issueNumber}</h1>
				<p className="mt-2 text-muted-foreground">
					Issue not found in {owner}/{name}
				</p>
			</>
		);
	}

	return (
		<>
			{/* Header */}
			<div className="flex items-start gap-3">
				<IssueStateIcon state={issue.state} />
				<div>
					<h1 className="text-2xl font-bold">{issue.title}</h1>
					<div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
						<span>#{issue.number}</span>
						<Badge
							variant={issue.state === "open" ? "default" : "secondary"}
							className={
								issue.state === "open" ? "bg-green-600 hover:bg-green-700" : ""
							}
						>
							{issue.state === "open" ? "Open" : "Closed"}
						</Badge>
						{issue.authorLogin && (
							<span className="flex items-center gap-1">
								<Avatar className="size-5">
									<AvatarImage src={issue.authorAvatarUrl ?? undefined} />
									<AvatarFallback className="text-[10px]">
										{issue.authorLogin[0]?.toUpperCase()}
									</AvatarFallback>
								</Avatar>
								<span className="font-medium text-foreground">
									{issue.authorLogin}
								</span>{" "}
								opened {formatRelative(issue.githubUpdatedAt)}
							</span>
						)}
						{issue.labelNames.map((label) => (
							<Badge key={label} variant="outline" className="text-xs">
								{label}
							</Badge>
						))}
					</div>
				</div>
			</div>

			{/* Body */}
			{issue.body && (
				<Card className="mt-6">
					<CardContent className="pt-6">
						<div className="prose prose-sm dark:prose-invert max-w-none">
							<Markdown remarkPlugins={[remarkGfm]}>{issue.body}</Markdown>
						</div>
					</CardContent>
				</Card>
			)}

			{/* Action bar — close / reopen */}
			<IssueActionBar
				ownerLogin={owner}
				name={name}
				number={issueNumber}
				repositoryId={issue.repositoryId}
				state={issue.state}
			/>

			{/* Comments */}
			{issue.comments.length > 0 && (
				<div className="mt-8">
					<h2 className="text-lg font-semibold mb-4">
						{issue.comments.length} Comment
						{issue.comments.length !== 1 ? "s" : ""}
					</h2>
					<div className="space-y-4">
						{issue.comments.map((comment) => (
							<Card key={comment.githubCommentId}>
								<CardHeader className="pb-2">
									<div className="flex items-center gap-2 text-sm">
										{comment.authorLogin && (
											<span className="flex items-center gap-1.5">
												<Avatar className="size-5">
													<AvatarImage
														src={comment.authorAvatarUrl ?? undefined}
													/>
													<AvatarFallback className="text-[10px]">
														{comment.authorLogin[0]?.toUpperCase()}
													</AvatarFallback>
												</Avatar>
												<span className="font-medium">
													{comment.authorLogin}
												</span>
											</span>
										)}
										<span className="text-muted-foreground">
											{formatDate(comment.createdAt)}
										</span>
									</div>
								</CardHeader>
								<CardContent>
									<div className="prose prose-sm dark:prose-invert max-w-none">
										<Markdown remarkPlugins={[remarkGfm]}>
											{comment.body}
										</Markdown>
									</div>
								</CardContent>
							</Card>
						))}
					</div>
				</div>
			)}

			{issue.comments.length === 0 && (
				<p className="mt-8 text-sm text-muted-foreground">No comments yet.</p>
			)}

			{/* Comment form */}
			<Separator className="mt-8" />
			<CommentForm
				ownerLogin={owner}
				name={name}
				number={issueNumber}
				repositoryId={issue.repositoryId}
			/>
		</>
	);
}

// ---------------------------------------------------------------------------
// Comment form
// ---------------------------------------------------------------------------

function CommentForm({
	ownerLogin,
	name,
	number,
	repositoryId,
}: {
	ownerLogin: string;
	name: string;
	number: number;
	repositoryId: number;
}) {
	const writeClient = useGithubWrite();
	const [commentResult, submitComment] = useAtom(
		writeClient.createComment.mutate,
	);
	const [body, setBody] = useState("");
	const correlationPrefix = useId();

	const isSubmitting = Result.isWaiting(commentResult);

	return (
		<div className="mt-6">
			<h3 className="text-sm font-semibold mb-2">Add a comment</h3>
			<Textarea
				placeholder="Leave a comment..."
				value={body}
				onChange={(e) => setBody(e.target.value)}
				rows={4}
				disabled={isSubmitting}
				className="mb-3"
			/>
			<div className="flex items-center justify-between">
				<div>
					{Result.isFailure(commentResult) && (
						<p className="text-sm text-destructive">
							Failed to submit comment. Please try again.
						</p>
					)}
					{Result.isSuccess(commentResult) && body === "" && (
						<p className="text-sm text-green-600">Comment submitted!</p>
					)}
				</div>
				<Button
					size="sm"
					disabled={body.trim().length === 0 || isSubmitting}
					onClick={() => {
						submitComment({
							correlationId: `${correlationPrefix}-comment-${Date.now()}`,
							ownerLogin,
							name,
							repositoryId,
							number,
							body: body.trim(),
						});
						setBody("");
					}}
				>
					{isSubmitting ? "Submitting..." : "Comment"}
				</Button>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Issue action bar — close / reopen
// ---------------------------------------------------------------------------

function IssueActionBar({
	ownerLogin,
	name,
	number,
	repositoryId,
	state,
}: {
	ownerLogin: string;
	name: string;
	number: number;
	repositoryId: number;
	state: "open" | "closed";
}) {
	const writeClient = useGithubWrite();
	const [stateResult, doUpdateState] = useAtom(
		writeClient.updateIssueState.mutate,
	);
	const correlationPrefix = useId();
	const isUpdating = Result.isWaiting(stateResult);

	return (
		<Card className="mt-6">
			<CardContent className="pt-4">
				<div className="flex flex-wrap items-center gap-3">
					{state === "open" && (
						<Button
							variant="outline"
							size="sm"
							disabled={isUpdating}
							onClick={() => {
								doUpdateState({
									correlationId: `${correlationPrefix}-close-${Date.now()}`,
									ownerLogin,
									name,
									repositoryId,
									number,
									state: "closed",
								});
							}}
						>
							{isUpdating ? "Closing..." : "Close issue"}
						</Button>
					)}

					{state === "closed" && (
						<Button
							variant="outline"
							size="sm"
							disabled={isUpdating}
							onClick={() => {
								doUpdateState({
									correlationId: `${correlationPrefix}-reopen-${Date.now()}`,
									ownerLogin,
									name,
									repositoryId,
									number,
									state: "open",
								});
							}}
						>
							{isUpdating ? "Reopening..." : "Reopen issue"}
						</Button>
					)}

					{Result.isFailure(stateResult) && (
						<span className="text-sm text-destructive">
							Failed to update issue state. Please try again.
						</span>
					)}
				</div>
			</CardContent>
		</Card>
	);
}

// ---------------------------------------------------------------------------
// Helper components
// ---------------------------------------------------------------------------

function IssueStateIcon({ state }: { state: "open" | "closed" }) {
	if (state === "open") {
		return (
			<svg
				className="mt-1.5 size-5 text-green-600 shrink-0"
				viewBox="0 0 16 16"
				fill="currentColor"
			>
				<path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
				<path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z" />
			</svg>
		);
	}
	return (
		<svg
			className="mt-1.5 size-5 text-purple-600 shrink-0"
			viewBox="0 0 16 16"
			fill="currentColor"
		>
			<path d="M11.28 6.78a.75.75 0 0 0-1.06-1.06L7.25 8.69 5.78 7.22a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0l3.5-3.5Z" />
			<path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0Zm-1.5 0a6.5 6.5 0 1 0-13 0 6.5 6.5 0 0 0 13 0Z" />
		</svg>
	);
}
