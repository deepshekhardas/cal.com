import { z } from "zod";
import { sendCancelledEmailsAndSMS } from "@calcom/emails/email-manager";
import logger from "@calcom/lib/logger";
import { safeStringify } from "@calcom/lib/safeStringify";

const log = logger.getSubLogger({ prefix: ["sendCancelledEmails"] });

export const sendCancelledEmailsPayloadSchema = z.object({
    evt: z.any(),
    eventNameObject: z.object({
        eventName: z.string().optional().nullable(),
    }),
    eventTypeMetadata: z.any().optional(),
});

export async function sendCancelledEmails(payload: string): Promise<void> {
    try {
        const { evt, eventNameObject, eventTypeMetadata } = sendCancelledEmailsPayloadSchema.parse(
            JSON.parse(payload)
        );

        log.debug(`Processing sendCancelledEmails task for booking ${evt.bookingId}`);

        await sendCancelledEmailsAndSMS(evt, eventNameObject, eventTypeMetadata);

        log.debug(`Successfully sent cancellation emails for booking ${evt.bookingId}`);
    } catch (error) {
        log.error(
            `Failed to send cancellation emails`,
            safeStringify({ payload, error: error instanceof Error ? error.message : String(error) })
        );
        throw error;
    }
}
