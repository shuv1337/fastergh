"use client";

import { Result, useAtomValue } from "@effect-atom/atom-react";
import { Button } from "@packages/ui/components/button";
import { ChevronRight, File, Folder } from "@packages/ui/components/icons";
import { Link } from "@packages/ui/components/link";
import { Skeleton } from "@packages/ui/components/skeleton";
import { cn } from "@packages/ui/lib/utils";
import { useCodeBrowse } from "@packages/ui/rpc/code-browse";
import { Either, Option, Schema } from "effect";
import { useMemo, useState } from "react";
import { useLocation } from "react-router";
import { extractErrorTag } from "@/lib/rpc-error";

// ---------------------------------------------------------------------------
// Tree building
// ---------------------------------------------------------------------------

type TreeNode = {
	readonly name: string;
	readonly path: string;
	readonly type: "blob" | "tree";
	readonly children: Array<TreeNode>;
	readonly read: boolean;
};

type FlatEntry = {
	readonly path: string;
	readonly type: "blob" | "tree" | "commit";
	readonly sha: string;
};

type ReadState = {
	readonly path: string;
	readonly fileSha: string;
	readonly readAt: number;
};

const ReadStateSchema = Schema.Array(
	Schema.Struct({
		path: Schema.String,
		fileSha: Schema.String,
		readAt: Schema.Number,
	}),
);

function buildTree(
	entries: ReadonlyArray<FlatEntry>,
	readStates: ReadonlyArray<ReadState>,
): Array<TreeNode> {
	const readStateByPath = new Map(
		readStates.map((state) => [state.path, state.fileSha]),
	);
	const root: Array<TreeNode> = [];
	const dirs = new Map<string, TreeNode>();

	const getOrCreateDir = (dirPath: string): TreeNode => {
		const existing = dirs.get(dirPath);
		if (existing) return existing;

		const parts = dirPath.split("/");
		const name = parts[parts.length - 1] ?? dirPath;
		const node: TreeNode = {
			name,
			path: dirPath,
			type: "tree",
			children: [],
			read: false,
		};
		dirs.set(dirPath, node);

		if (parts.length > 1) {
			const parentPath = parts.slice(0, -1).join("/");
			const parent = getOrCreateDir(parentPath);
			parent.children.push(node);
		} else {
			root.push(node);
		}

		return node;
	};

	for (const entry of entries) {
		// Skip commit entries (submodules)
		if (entry.type === "commit") continue;

		if (entry.type === "tree") {
			getOrCreateDir(entry.path);
		} else {
			const parts = entry.path.split("/");
			const name = parts[parts.length - 1] ?? entry.path;
			const isRead = readStateByPath.get(entry.path) === entry.sha;
			const fileNode: TreeNode = {
				name,
				path: entry.path,
				type: "blob",
				children: [],
				read: isRead,
			};

			if (parts.length > 1) {
				const parentPath = parts.slice(0, -1).join("/");
				const parent = getOrCreateDir(parentPath);
				parent.children.push(fileNode);
			} else {
				root.push(fileNode);
			}
		}
	}

	// Sort recursively: folders first, then files, alphabetically
	const sortNodes = (nodes: Array<TreeNode>) => {
		nodes.sort((a, b) => {
			if (a.type !== b.type) return a.type === "tree" ? -1 : 1;
			return a.name.localeCompare(b.name);
		});
		for (const node of nodes) {
			if (node.children.length > 0) sortNodes(node.children);
		}
	};
	sortNodes(root);

	return root;
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function TreeNodeItem({
	node,
	owner,
	name,
	activePath,
	depth,
	treeSha,
}: {
	node: TreeNode;
	owner: string;
	name: string;
	activePath: string | null;
	depth: number;
	treeSha: string;
}) {
	const [expanded, setExpanded] = useState(
		// Auto-expand if the active file is within this folder
		() =>
			node.type === "tree" &&
			activePath !== null &&
			activePath.startsWith(`${node.path}/`),
	);

	if (node.type === "tree") {
		return (
			<div>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={() => setExpanded((prev) => !prev)}
					className={cn(
						"h-auto w-full justify-start gap-1 rounded-sm px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors",
					)}
					style={{ paddingLeft: `${depth * 12 + 6}px` }}
				>
					<ChevronRight
						className={cn(
							"size-3 shrink-0 transition-transform",
							expanded && "rotate-90",
						)}
					/>
					<Folder className="size-3 shrink-0 text-status-repo" />
					<span className="truncate">{node.name}</span>
				</Button>
				{expanded && (
					<div>
						{node.children.map((child) => (
							<TreeNodeItem
								key={child.path}
								node={child}
								owner={owner}
								name={name}
								activePath={activePath}
								depth={depth + 1}
								treeSha={treeSha}
							/>
						))}
					</div>
				)}
			</div>
		);
	}

	const isActive = activePath === node.path;
	const fileClass = node.read ? "text-muted-foreground/50" : "text-foreground";
	const encodedPath = node.path
		.split("/")
		.map((segment) => encodeURIComponent(segment))
		.join("/");

	return (
		<Link
			href={`/${owner}/${name}/blob/${encodeURIComponent(treeSha)}/${encodedPath}`}
			className={cn(
				"flex w-full items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] transition-colors no-underline",
				isActive
					? "bg-sidebar-accent text-foreground font-medium"
					: "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
			)}
			style={{ paddingLeft: `${depth * 12 + 6 + 16}px` }}
		>
			{!node.read && (
				<span className="size-1.5 shrink-0 rounded-full bg-status-open" />
			)}
			<File className={cn("size-3 shrink-0", fileClass)} />
			<span className={cn("truncate", fileClass)}>{node.name}</span>
		</Link>
	);
}

export function FileTreeClient({
	owner,
	name,
}: {
	owner: string;
	name: string;
}) {
	const location = useLocation();
	const pathname = location.pathname;
	const routeRef = useMemo(() => {
		const segments = pathname.split("/").filter(Boolean);
		const segment = segments[2];
		if (
			(segment !== "tree" && segment !== "blob") ||
			segments[3] === undefined
		) {
			return "HEAD";
		}

		try {
			return decodeURIComponent(segments[3]);
		} catch {
			return "HEAD";
		}
	}, [pathname]);
	const client = useCodeBrowse();
	const treeAtom = useMemo(
		() =>
			client.getFileTree.callAsQuery({
				ownerLogin: owner,
				name,
				sha: routeRef,
			}),
		[client, owner, name, routeRef],
	);
	const treeResult = useAtomValue(treeAtom);
	const activePath = useMemo(() => {
		const segments = pathname.split("/").filter(Boolean);
		if (segments[2] !== "blob") return null;
		if (segments.length < 5) return null;

		const encodedPathSegments = segments.slice(4);
		if (encodedPathSegments.length === 0) return null;

		try {
			return encodedPathSegments
				.map((segment) => decodeURIComponent(segment))
				.join("/");
		} catch {
			return null;
		}
	}, [pathname]);
	const treeValueOption = Result.value(treeResult);
	const treeSha = useMemo(
		() => (Option.isSome(treeValueOption) ? treeValueOption.value.sha : "HEAD"),
		[treeValueOption],
	);

	const fileReadStateAtom = useMemo(
		() =>
			client.getFileReadState.query({
				ownerLogin: owner,
				name,
				treeSha,
			}),
		[client, owner, name, treeSha],
	);
	const fileReadStateResult = useAtomValue(fileReadStateAtom);
	const fileReadStates: Array<ReadState> = useMemo<Array<ReadState>>(() => {
		const readStateOption = Result.value(fileReadStateResult);
		if (Option.isNone(readStateOption)) return [];

		const result = Schema.decodeUnknownEither(ReadStateSchema)(
			readStateOption.value,
		);
		return Either.match(result, {
			onLeft: () => [],
			onRight: (states) =>
				[...states].map((state) => ({
					path: state.path,
					fileSha: state.fileSha,
					readAt: state.readAt,
				})),
		});
	}, [fileReadStateResult]);

	const isLoading = Result.isWaiting(treeResult);
	const isInitial = Result.isInitial(treeResult);

	const tree = useMemo(() => {
		if (Option.isNone(treeValueOption)) return null;
		return buildTree(treeValueOption.value.tree, fileReadStates);
	}, [treeValueOption, fileReadStates]);

	const errorOption = Result.error(treeResult);
	const hasError = Option.isSome(errorOption);

	if (isInitial || (isLoading && tree === null)) {
		return (
			<div className="py-1 space-y-px px-2">
				{[1, 2, 3, 4, 5, 6, 7].map((i) => (
					<Skeleton key={i} className="h-5 w-full rounded-sm" />
				))}
			</div>
		);
	}

	if (hasError && tree === null) {
		const tag = extractErrorTag(errorOption.value);
		const message =
			tag === "NotAuthenticated"
				? "Sign in to browse code"
				: tag === "RepoNotFound"
					? "Repository not found"
					: "Failed to load file tree";

		return (
			<div className="px-3 py-4 text-center">
				<p className="text-[11px] text-muted-foreground">{message}</p>
			</div>
		);
	}

	if (tree === null || tree.length === 0) {
		return (
			<div className="px-3 py-4 text-center">
				<p className="text-[11px] text-muted-foreground">No files found</p>
			</div>
		);
	}

	return (
		<div className="py-1">
			{tree.map((node) => (
				<TreeNodeItem
					key={node.path}
					node={node}
					owner={owner}
					name={name}
					activePath={activePath}
					depth={0}
					treeSha={treeSha}
				/>
			))}
		</div>
	);
}
