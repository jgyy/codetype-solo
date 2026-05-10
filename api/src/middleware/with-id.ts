import type { IdPort } from "../core/ports/id-port";
import type { Mw } from "./types";

export function withId(id: IdPort): Mw {
    return (next) => async (ctx) => {
        ctx.id = id;
        return next(ctx);
    };
}
