import { z } from "zod";

export type TNoShowInputSchema = {
  bookingUid: string;
  noShowHost: boolean;
  attendeeEmail?: string;
};

export const ZMarkHostAsNoShowInputSchema: z.ZodType<TNoShowInputSchema> = z.object({
  bookingUid: z.string(),
  noShowHost: z.boolean(),
  attendeeEmail: z.string().optional(),
});
