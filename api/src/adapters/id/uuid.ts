import { randomUUID } from "node:crypto";
import type { IdPort } from "../../core/ports/id-port";

export const uuidId = (): IdPort => ({
    newId: () => randomUUID(),
});
