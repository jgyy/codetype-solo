import type { Repos } from "../repos";
import type { Mw } from "./types";

export function withRepos(repos: Repos): Mw {
    return (next) => async (ctx) => {
        ctx.repos = repos;
        return next(ctx);
    };
}
