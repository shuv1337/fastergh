export default function HomePage() {
	return (
		<main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
			<div className="text-center">
				<h1 className="text-4xl font-bold">QuickHub</h1>
				<p className="mt-4 text-lg text-muted-foreground">
					GitHub Mirror — Fast reads from Convex
				</p>
			</div>

			<div className="max-w-lg text-center text-sm text-muted-foreground">
				<p>
					Connect GitHub repositories and browse issues, PRs, and commits with
					instant page loads backed by Convex real-time projections.
				</p>
			</div>
		</main>
	);
}
