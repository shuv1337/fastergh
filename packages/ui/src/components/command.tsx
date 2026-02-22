"use client";

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@packages/ui/components/dialog";
import { SearchIcon } from "@packages/ui/components/icons";
import { cn } from "@packages/ui/lib/utils";
import { Command as CommandPrimitive } from "cmdk";
import type * as React from "react";
import { useCallback, useRef } from "react";
import { Link } from "./link";

function Command({
	className,
	...props
}: React.ComponentProps<typeof CommandPrimitive>) {
	return (
		<CommandPrimitive
			data-slot="command"
			className={cn(
				"bg-popover text-popover-foreground flex h-full w-full flex-col overflow-hidden rounded-md",
				className,
			)}
			{...props}
		/>
	);
}

function CommandDialog({
	title = "Command Palette",
	description = "Search for a command to run...",
	children,
	className,
	commandProps,
	showCloseButton = true,
	...props
}: React.ComponentProps<typeof Dialog> & {
	title?: string;
	description?: string;
	className?: string;
	commandProps?: React.ComponentProps<typeof CommandPrimitive>;
	showCloseButton?: boolean;
}) {
	return (
		<Dialog {...props}>
			<DialogHeader className="sr-only">
				<DialogTitle>{title}</DialogTitle>
				<DialogDescription>{description}</DialogDescription>
			</DialogHeader>
			<DialogContent
				className={cn("overflow-hidden p-0", className)}
				showCloseButton={showCloseButton}
			>
				<Command
					{...commandProps}
					className={cn(
						"[&_[cmdk-group-heading]]:text-muted-foreground **:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5",
						commandProps?.className,
					)}
				>
					{children}
				</Command>
			</DialogContent>
		</Dialog>
	);
}

function CommandInput({
	className,
	leading,
	trailing,
	...props
}: React.ComponentProps<typeof CommandPrimitive.Input> & {
	leading?: React.ReactNode;
	trailing?: React.ReactNode;
}) {
	return (
		<div
			data-slot="command-input-wrapper"
			className="flex min-h-9 items-center gap-2 border-b px-3"
		>
			<SearchIcon className="size-4 shrink-0 opacity-50" />
			{leading !== undefined && (
				<div className="shrink-0 overflow-hidden">{leading}</div>
			)}
			<CommandPrimitive.Input
				data-slot="command-input"
				className={cn(
					"placeholder:text-muted-foreground flex h-10 min-w-[8rem] flex-1 rounded-md bg-transparent py-3 text-base md:text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
					className,
				)}
				{...props}
			/>
			{trailing !== undefined && <div className="shrink-0">{trailing}</div>}
		</div>
	);
}

function CommandList({
	className,
	...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
	return (
		<CommandPrimitive.List
			data-slot="command-list"
			className={cn(
				"max-h-[300px] scroll-py-1 overflow-x-hidden overflow-y-auto",
				className,
			)}
			{...props}
		/>
	);
}

function CommandEmpty({
	...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
	return (
		<CommandPrimitive.Empty
			data-slot="command-empty"
			className="py-6 text-center text-sm"
			{...props}
		/>
	);
}

function CommandGroup({
	className,
	...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
	return (
		<CommandPrimitive.Group
			data-slot="command-group"
			className={cn(
				"text-foreground [&_[cmdk-group-heading]]:text-muted-foreground overflow-hidden p-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium",
				className,
			)}
			{...props}
		/>
	);
}

function CommandSeparator({
	className,
	...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
	return (
		<CommandPrimitive.Separator
			data-slot="command-separator"
			className={cn("bg-border -mx-1 h-px", className)}
			{...props}
		/>
	);
}

function CommandItem({
	className,
	...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) {
	return (
		<CommandPrimitive.Item
			data-slot="command-item"
			className={cn(
				"data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				className,
			)}
			{...props}
		/>
	);
}

function CommandShortcut({
	className,
	...props
}: React.ComponentProps<"span">) {
	return (
		<span
			data-slot="command-shortcut"
			className={cn(
				"text-muted-foreground ml-auto text-xs tracking-widest",
				className,
			)}
			{...props}
		/>
	);
}

/**
 * A CommandItem that renders a real `<Link>` underneath so users get:
 * - Prefetching on hover / viewport entry
 * - Real `<a>` tag (right-click → copy link, middle-click → new tab, cmd+click)
 * - Accessible link semantics
 *
 * On keyboard Enter (cmdk `onSelect`), we programmatically click the link.
 * On mouse interactions, the Link handles navigation directly.
 *
 * Pass `onBeforeNavigate` to run side-effects (e.g. close dialog, save recents)
 * before navigation occurs.
 */
function CommandLinkItem({
	href,
	onBeforeNavigate,
	className,
	children,
	...props
}: Omit<React.ComponentProps<typeof CommandPrimitive.Item>, "onSelect"> & {
	href: string;
	onBeforeNavigate?: () => void;
}) {
	const linkRef = useRef<HTMLAnchorElement>(null);

	const handleSelect = useCallback(() => {
		onBeforeNavigate?.();
		// Programmatically click the link so Next.js Link handles the navigation
		// (this covers keyboard Enter where the mouse never touches the link)
		linkRef.current?.click();
	}, [onBeforeNavigate]);

	return (
		<CommandPrimitive.Item
			data-slot="command-item"
			className={cn(
				"data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				className,
			)}
			onSelect={handleSelect}
			{...props}
		>
			{/* Invisible stretched link for prefetch + real anchor semantics */}
			<Link
				ref={linkRef}
				href={href}
				className="absolute inset-0 z-0"
				tabIndex={-1}
				aria-hidden
				onClick={(event) => {
					onBeforeNavigate?.();
					// Let the Link component handle the actual navigation —
					// don't prevent default here so the <a> click goes through.
					// But stop propagation so cmdk doesn't also call onSelect.
					event.stopPropagation();
				}}
			>
				<span className="sr-only">{href}</span>
			</Link>
			{/* Content sits above the link overlay */}
			<div className="relative z-10 flex min-w-0 flex-1 items-center gap-2 pointer-events-none">
				{children}
			</div>
		</CommandPrimitive.Item>
	);
}

export {
	Command,
	CommandDialog,
	CommandInput,
	CommandList,
	CommandEmpty,
	CommandGroup,
	CommandItem,
	CommandLinkItem,
	CommandShortcut,
	CommandSeparator,
};
