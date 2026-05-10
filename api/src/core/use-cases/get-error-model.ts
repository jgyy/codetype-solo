import {
    isErr,
    isWarmedUp,
    ok,
    type ApiError,
    type ErrorModel,
    type Result,
} from "@codetype/shared";
import type { ProfilePort } from "../ports";

export type ErrorModelView = { error_model: ErrorModel | null; warmed_up: boolean };

export const getErrorModel =
    (d: { profiles: ProfilePort }) =>
    async (input: { sub: string }): Promise<Result<ErrorModelView, ApiError>> => {
        const r = await d.profiles.get(input.sub);
        if (isErr(r)) return r as Result<never, ApiError>;
        const model = r.value?.error_model ?? null;
        return ok({ error_model: model, warmed_up: isWarmedUp(model ?? undefined) });
    };
