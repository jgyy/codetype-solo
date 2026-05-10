import type { IdPort } from "../../core/ports/id-port";

export const seqId = (prefix = "id"): IdPort => {
    let n = 0;
    return {
        newId: () => `${prefix}-${++n}`,
    };
};
