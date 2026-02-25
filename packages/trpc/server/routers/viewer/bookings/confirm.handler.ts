import { prisma } from "@calcom/prisma";

import { ConfirmBookingService } from "@calcom/features/bookings/services/ConfirmBookingService";

import type { ConfirmOptions } from "./confirm.types";

/**
 * Single point of entry across trpc, magic-links, and API v2
 */
export const confirmHandler = async ({ ctx, input }: ConfirmOptions) => {
  const service = new ConfirmBookingService(prisma);
  return service.confirm({ ctx, input });
};
