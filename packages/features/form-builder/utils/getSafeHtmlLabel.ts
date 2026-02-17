import { fieldsThatSupportLabelAsSafeHtml } from "../fieldsThatSupportLabelAsSafeHtml";
import { markdownToSafeHTML } from "@calcom/lib/markdownToSafeHTML";
import type { FieldType } from "@calcom/prisma/zod-utils";

/**
 * Shared utility to generate labelAsSafeHtml for form fields.
 * Ensures clinical/server consistency and avoids code duplication.
 */
export const getSafeHtmlLabel = (field: { type: string; label?: string | null }) => {
    if (fieldsThatSupportLabelAsSafeHtml.includes(field.type as FieldType)) {
        return {
            labelAsSafeHtml: markdownToSafeHTML(field.label || null) || "",
        };
    }
    return null;
};
