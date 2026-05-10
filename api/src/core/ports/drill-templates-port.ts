import type { Language } from "@codetype/shared";

export type DrillTemplate = {
    tmpl: string;
    bags: Record<string, string[]>;
};

export type DrillTemplatesPort = {
    list(lang: Language, klass: string): DrillTemplate[];
};
