import type { Actor } from "@calcom/features/booking-audit/lib/dto/types";
import type { ValidActionSource } from "@calcom/features/booking-audit/lib/types/actionSource";
import type { TraceContext } from "@calcom/lib/tracing";

import type { TrpcSessionUser } from "../../../types";
import type { TConfirmInputSchema } from "./confirm.schema";

export type ConfirmOptions = {
    ctx: {
        user: Pick<
            NonNullable<TrpcSessionUser>,
            "id" | "uuid" | "email" | "username" | "role" | "destinationCalendar"
        >;
        traceContext: TraceContext;
    };
    input: TConfirmInputSchema & { actionSource: ValidActionSource; actor: Actor };
};
