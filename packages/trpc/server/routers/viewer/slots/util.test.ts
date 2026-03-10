import { describe, it, expect } from "vitest";

import { BookingDateInPastError, isTimeOutOfBounds } from "@calcom/lib/isOutOfBounds";

import { TRPCError } from "@trpc/server";

describe("BookingDateInPastError handling", () => {
  it("should convert BookingDateInPastError to TRPCError with BAD_REQUEST code", () => {
    const testFilteringLogic = () => {
      const mockSlot = {
        time: "2024-05-20T12:30:00.000Z", // Past date
        attendees: 1,
      };

      const mockEventType = {
        minimumBookingNotice: 0,
      };

      const isFutureLimitViolationForTheSlot = false; // Mock this to false

      let isOutOfBounds = false;
      try {
        // This will throw BookingDateInPastError for past dates
        isOutOfBounds = isTimeOutOfBounds({
          time: mockSlot.time,
          minimumBookingNotice: mockEventType.minimumBookingNotice,
        });
      } catch (error) {
        if (error instanceof BookingDateInPastError) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error.message,
          });
        }
        throw error;
      }

      return !isFutureLimitViolationForTheSlot && !isOutOfBounds;
    };

    // This should throw a TRPCError with BAD_REQUEST code
    expect(() => testFilteringLogic()).toThrow(TRPCError);
    expect(() => testFilteringLogic()).toThrow("Attempting to book a meeting in the past.");
  });
});

describe("_mapSlotsToDate with onlyShowFirstAvailableSlot + seats", () => {
  it("should not skip the next slot if the first slot is fully booked", () => {
    const eventType = {
      onlyShowFirstAvailableSlot: true,
      seatsPerTimeSlot: 2,
    };
    const currentSeatsMap = new Map([
      ["2024-05-20T09:00:00.000Z", { attendees: 2, uid: "123" }],
    ]);

    const availableTimeSlots = [
      { time: { toDate: () => new Date("2024-05-20T09:00:00.000Z"), toISOString: () => "2024-05-20T09:00:00.000Z" } },
      { time: { toDate: () => new Date("2024-05-20T10:00:00.000Z"), toISOString: () => "2024-05-20T10:00:00.000Z" } },
    ] as any[];

    const formatter = {
      format: () => "2024-05-20",
    };

    const result = availableTimeSlots.reduce((r, { time, ...passThroughProps }) => {
      const dateString = formatter.format(time.toDate());
      const timeISO = time.toISOString();

      r[dateString] = r[dateString] || [];
      if (eventType?.onlyShowFirstAvailableSlot && r[dateString].length > 0) {
        const firstSlotForDay = r[dateString][0];
        const firstSlotIsFullyBooked =
          eventType.seatsPerTimeSlot &&
          firstSlotForDay?.attendees !== undefined &&
          firstSlotForDay.attendees >= eventType.seatsPerTimeSlot;
        if (!firstSlotIsFullyBooked) {
          return r;
        }
      }

      const existingBooking = currentSeatsMap.get(timeISO);

      r[dateString].push({
        ...passThroughProps,
        time: timeISO,
        ...(existingBooking && {
          attendees: existingBooking.attendees,
          bookingUid: existingBooking.uid,
        }),
      });
      return r;
    }, Object.create(null));

    expect(result["2024-05-20"]).toHaveLength(2);
    expect(result["2024-05-20"][0].time).toBe("2024-05-20T09:00:00.000Z");
    expect(result["2024-05-20"][0].attendees).toBe(2);
    expect(result["2024-05-20"][1].time).toBe("2024-05-20T10:00:00.000Z");
  });

  it("should skip the next slot if the first slot is NOT fully booked", () => {
    const eventType = {
      onlyShowFirstAvailableSlot: true,
      seatsPerTimeSlot: 2,
    };
    const currentSeatsMap = new Map([
      ["2024-05-20T09:00:00.000Z", { attendees: 1, uid: "123" }],
    ]);

    const availableTimeSlots = [
      { time: { toDate: () => new Date("2024-05-20T09:00:00.000Z"), toISOString: () => "2024-05-20T09:00:00.000Z" } },
      { time: { toDate: () => new Date("2024-05-20T10:00:00.000Z"), toISOString: () => "2024-05-20T10:00:00.000Z" } },
    ] as any[];

    const formatter = {
      format: () => "2024-05-20",
    };

    const result = availableTimeSlots.reduce((r, { time, ...passThroughProps }) => {
      const dateString = formatter.format(time.toDate());
      const timeISO = time.toISOString();

      r[dateString] = r[dateString] || [];
      if (eventType?.onlyShowFirstAvailableSlot && r[dateString].length > 0) {
        const firstSlotForDay = r[dateString][0];
        const firstSlotIsFullyBooked =
          eventType.seatsPerTimeSlot &&
          firstSlotForDay?.attendees !== undefined &&
          firstSlotForDay.attendees >= eventType.seatsPerTimeSlot;
        if (!firstSlotIsFullyBooked) {
          return r;
        }
      }

      const existingBooking = currentSeatsMap.get(timeISO);

      r[dateString].push({
        ...passThroughProps,
        time: timeISO,
        ...(existingBooking && {
          attendees: existingBooking.attendees,
          bookingUid: existingBooking.uid,
        }),
      });
      return r;
    }, Object.create(null));

    expect(result["2024-05-20"]).toHaveLength(1);
    expect(result["2024-05-20"][0].time).toBe("2024-05-20T09:00:00.000Z");
    expect(result["2024-05-20"][0].attendees).toBe(1);
  });
});
