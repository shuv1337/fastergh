import type { MiddlewareImplementation } from "@packages/confect/rpc";
import { DatabaseSecurityMiddlewareImplementations } from "./security";
import { DatabaseRpcTelemetryLayer } from "./telemetry";

export const DatabaseRpcModuleMiddlewares: {
	layer: typeof DatabaseRpcTelemetryLayer;
	implementations: ReadonlyArray<MiddlewareImplementation>;
} = {
	layer: DatabaseRpcTelemetryLayer,
	implementations: DatabaseSecurityMiddlewareImplementations,
};
