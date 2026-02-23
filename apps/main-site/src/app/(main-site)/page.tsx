/**
 * Default slot page — not rendered visually.
 *
 * All content flows through the `@sidebar` and `@detail` parallel route slots
 * defined in layout.tsx. This file exists as a route matcher so Next.js
 * resolves the root `/` URL correctly.
 */
export default function HomePage() {
	return null;
}
