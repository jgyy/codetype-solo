import type { DynamoDBRecord, AttributeValue as LambdaAttributeValue } from "aws-lambda";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import type { AttributeValue as SdkAttributeValue } from "@aws-sdk/client-dynamodb";
import type { Language } from "@codetype/shared";
import type { DomainEvent, ItemImage } from "./types";

const SUPPORTED_LANGUAGES: ReadonlySet<string> = new Set(["js", "py", "c", "go"]);

function asImage(
    image: Record<string, LambdaAttributeValue> | undefined,
): ItemImage | null {
    if (!image) return null;
    return unmarshall(image as Record<string, SdkAttributeValue>);
}

function subFromPk(pk: unknown): string | null {
    if (typeof pk !== "string") return null;
    return pk.startsWith("USER#") ? pk.slice("USER#".length) : null;
}

function langFromSnippetPk(pk: unknown): Language | null {
    if (typeof pk !== "string" || !pk.startsWith("SNIPPET#")) return null;
    const rest = pk.slice("SNIPPET#".length);
    return SUPPORTED_LANGUAGES.has(rest) ? (rest as Language) : null;
}

function decodeAttempt(
    eventName: string | undefined,
    nu: ItemImage | null,
): DomainEvent | null {
    if (eventName !== "INSERT" || !nu) return null;
    const sub = subFromPk(nu.PK);
    const lang = nu.language;
    if (!sub || typeof lang !== "string" || !SUPPORTED_LANGUAGES.has(lang)) return null;
    return { type: "AttemptRecorded", sub, language: lang as Language, image: nu };
}

function decodeProfile(
    eventName: string | undefined,
    nu: ItemImage | null,
    old: ItemImage | null,
): DomainEvent | null {
    if (eventName !== "INSERT" && eventName !== "MODIFY") return null;
    if (!nu) return null;
    const sub = subFromPk(nu.PK);
    if (!sub) return null;
    return { type: "ProfileUpdated", sub, image: nu, previous: old };
}

function decodeSubmission(
    eventName: string | undefined,
    nu: ItemImage | null,
    old: ItemImage | null,
): DomainEvent | null {
    if (eventName !== "MODIFY" || !nu) return null;
    const newStatus = nu.status;
    const oldStatus = old?.status;
    const id = nu.id;
    if (typeof id !== "string" || newStatus === oldStatus) return null;
    if (newStatus === "approved")
        return { type: "SubmissionApproved", submissionId: id, image: nu };
    if (newStatus === "rejected")
        return { type: "SubmissionRejected", submissionId: id, image: nu };
    return null;
}

function decodeSnippet(
    eventName: string | undefined,
    old: ItemImage | null,
): DomainEvent | null {
    if (eventName !== "REMOVE" || !old) return null;
    const lang = langFromSnippetPk(old.PK);
    const id = old.id;
    if (!lang || typeof id !== "string") return null;
    return { type: "SnippetRetracted", snippetId: id, language: lang, previous: old };
}

export function decode(record: DynamoDBRecord): DomainEvent | null {
    const nu = asImage(record.dynamodb?.NewImage);
    const old = asImage(record.dynamodb?.OldImage);
    const entity = (nu?.entity ?? old?.entity) as string | undefined;
    if (!entity) return null;

    switch (entity) {
        case "ATTEMPT":
            return decodeAttempt(record.eventName, nu);
        case "PROFILE":
            return decodeProfile(record.eventName, nu, old);
        case "SUBMISSION":
            return decodeSubmission(record.eventName, nu, old);
        case "SNIPPET":
            return decodeSnippet(record.eventName, old);
        default:
            return null;
    }
}
