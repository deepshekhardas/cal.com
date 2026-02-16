import { z } from "zod";
import dayjs from "@calcom/dayjs";
import { queryNumberArray } from "../hooks/useTypedQuery";

export const filterQuerySchema = z.object({
    teamIds: queryNumberArray.optional(),
    userIds: queryNumberArray.optional(),
    status: z.enum(["upcoming", "recurring", "past", "cancelled", "unconfirmed"]).optional(),
    eventTypeIds: queryNumberArray.optional(),
    afterStartDate: z
        .string()
        .optional()
        .transform((date) => (date ? dayjs(date).startOf("day").format("YYYY-MM-DDTHH:mm:ss") : undefined)),
    beforeEndDate: z
        .string()
        .optional()
        .transform((date) => (date ? dayjs(date).endOf("day").format("YYYY-MM-DDTHH:mm:ss") : undefined)),
});
