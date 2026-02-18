import {
	type ConvexTestInstance,
	makeTestLayer,
} from "@packages/confect/testing";
import { convexTest, type TestConvex } from "@packages/convex-test";
import type { SchemaDefinition } from "convex/server";
import { Context, Effect, Layer } from "effect";
import schema from "./convex/schema";

const modules = import.meta.glob("./convex/**/*.*s");

type SchemaType = typeof schema;

/**
 * Create a raw convex-test instance with schema and modules pre-configured.
 * Each call returns a fresh isolated DB.
 */
export const createConvexTest = () => convexTest(schema, modules);

/**
 * Effect service that provides a fresh convex-test instance per access.
 * Use `yield* TestConvexClient` in `it.effect` to get the `t` object.
 */
export class TestConvexClient extends Context.Tag("TestConvexClient")<
	TestConvexClient,
	TestConvex<SchemaType>
>() {}

/**
 * Layer that provides a fresh TestConvexClient.
 * Because `layer()` from @effect/vitest shares one layer per describe block,
 * and we need per-test isolation, use `Layer.effect` so each `yield*`
 * creates a fresh instance.
 *
 * NOTE: convex-test sets a global, so concurrent tests would collide.
 * This is fine with vitest's default sequential test execution.
 */
export const TestConvexClientLive = Layer.effect(
	TestConvexClient,
	Effect.sync(() => convexTest(schema, modules)),
);

/**
 * Create a Confect test layer (provides ConvexClient Effect service).
 */
export const createConvexTestLayer = () =>
	makeTestLayer({
		schema,
		modules,
		convexTest,
	});
