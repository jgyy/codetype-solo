import type { Language } from "@codetype/shared";
import type { DrillTemplate, DrillTemplatesPort } from "../../core/ports/drill-templates-port";

export const inMemoryDrillTemplates = (
    seed: Partial<Record<Language, Record<string, DrillTemplate[]>>>,
): DrillTemplatesPort => ({
    list: (lang, klass) => seed[lang]?.[klass] ?? [],
});
