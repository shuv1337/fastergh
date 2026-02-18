import { createRpcFactory, makeRpcModule } from "@packages/confect/rpc";
import { Effect, Schema } from "effect";
import { ConfectQueryCtx, confectSchema } from "../confect";
import { DatabaseRpcTelemetryLayer } from "./telemetry";

const factory = createRpcFactory({ schema: confectSchema });

const adminModule = makeRpcModule(
	{
		healthCheck: factory.query(
			{
				success: Schema.Struct({
					ok: Schema.Boolean,
					tableCount: Schema.Number,
				}),
			},
			() =>
				Effect.gen(function* () {
					const ctx = yield* ConfectQueryCtx;
					const repos = yield* ctx.db.query("github_repositories").take(1);
					return {
						ok: true,
						tableCount: repos.length,
					};
				}),
		),
	},
	{ middlewares: DatabaseRpcTelemetryLayer },
);

export const { healthCheck } = adminModule.handlers;
export { adminModule };
export type AdminModule = typeof adminModule;
