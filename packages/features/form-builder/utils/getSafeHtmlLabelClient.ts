import { fieldsThatSupportLabelAsSafeHtml } from "@calcom/features/form-builder/fieldsThatSupportLabelAsSafeHtml";
import type { FieldType } from "@calcom/features/form-builder/schema";
import { markdownToSafeHTMLClient } from "@calcom/lib/markdownToSafeHTMLClient";

export const getSafeHtmlLabelClient = (field: { type: string; label?: string | null }) => {
    if (fieldsThatSupportLabelAsSafeHtml.includes(field.type as FieldType)) {
        return {
            labelAsSafeHtml: markdownToSafeHTMLClient(field.label || null) || "",
        };
    }
    return null;
};
