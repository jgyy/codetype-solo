import type { ApiError, Language, Result } from "@codetype/shared";
import type { Logger } from "../lib/logger";
import type { Repos } from "../repos";

export type ItemImage = Record<string, unknown>;

export type DomainEventType =
    | "AttemptRecorded"
    | "ProfileUpdated"
    | "SubmissionApproved"
    | "SubmissionRejected"
    | "SnippetRetracted";

export type AttemptRecorded = {
    type: "AttemptRecorded";
    sub: string;
    language: Language;
    image: ItemImage;
};

export type ProfileUpdated = {
    type: "ProfileUpdated";
    sub: string;
    image: ItemImage;
    previous: ItemImage | null;
};

export type SubmissionApproved = {
    type: "SubmissionApproved";
    submissionId: string;
    image: ItemImage;
};

export type SubmissionRejected = {
    type: "SubmissionRejected";
    submissionId: string;
    image: ItemImage;
};

export type SnippetRetracted = {
    type: "SnippetRetracted";
    snippetId: string;
    language: Language;
    previous: ItemImage;
};

export type DomainEvent =
    | AttemptRecorded
    | ProfileUpdated
    | SubmissionApproved
    | SubmissionRejected
    | SnippetRetracted;

export type ProjectorCtx = {
    repos: Repos;
    log: Logger;
};

export interface Projector {
    name: string;
    handles: readonly DomainEventType[];
    handle(event: DomainEvent, ctx: ProjectorCtx): Promise<Result<void, ApiError>>;
}
