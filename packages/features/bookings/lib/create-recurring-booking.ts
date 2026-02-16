import { post } from "@calcom/lib/fetch-wrapper";

import type { RecurringBookingCreateBody, RegularBookingCreateResult } from "../types";

export const createRecurringBooking = async (data: RecurringBookingCreateBody[]) => {
  const response = await post<
    RecurringBookingCreateBody[],
    // fetch response can't have a Date type, it must be a string
    (Omit<RegularBookingCreateResult, "startTime" | "endTime"> & {
      startTime: string;
      endTime: string;
    })[]
  >("/api/book/recurring-event", data);
  return response;
};
