import { DEMO_READONLY_CODE, DEMO_READONLY_MESSAGE, type DemoFeatureName } from "@/lib/demo/constants";

export class DemoReadonlyError extends Error {
  readonly code = DEMO_READONLY_CODE;
  readonly feature: DemoFeatureName;

  constructor(feature: DemoFeatureName = "generic", message = DEMO_READONLY_MESSAGE) {
    super(message);
    this.name = "DemoReadonlyError";
    this.feature = feature;
  }
}

export function isDemoReadonlyError(err: unknown): err is DemoReadonlyError {
  return (
    err instanceof DemoReadonlyError ||
    (typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === DEMO_READONLY_CODE)
  );
}
