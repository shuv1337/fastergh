"use client";

import type { VariantProps } from "class-variance-authority";
import type * as React from "react";
import { useCurrentPathname } from "../hooks/use-current-pathname";
import { Button, type buttonVariants } from "./button";
import { Link } from "./link";
import type { NavigationPrefetchParams } from "./navigation-prefetch-provider";

export interface LinkButtonProps
	extends React.AnchorHTMLAttributes<HTMLAnchorElement>,
		VariantProps<typeof buttonVariants> {
	href: string;
	children?: React.ReactNode;
	prefetch?: boolean;
	selectedVariant?: VariantProps<typeof buttonVariants>["variant"];
	prefetchKey?: string;
	prefetchParams?: NavigationPrefetchParams;
}

export function LinkButton({
	children,
	href,
	variant,
	size,
	className,
	selectedVariant,
	...props
}: LinkButtonProps) {
	const pathname = useCurrentPathname();
	const isSelected = href === pathname && selectedVariant;
	const finalVariant = isSelected ? selectedVariant : variant;

	return (
		<Button asChild variant={finalVariant} size={size} className={className}>
			<Link href={href} className="no-underline hover:no-underline" {...props}>
				{children}
			</Link>
		</Button>
	);
}
