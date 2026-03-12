import dayjs from "@calcom/dayjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@calcom/i18n/server", () => ({
  getTranslation: vi.fn(async () => (key: string) => key),
}));

import { UserAvailabilityService } from "./getUserAvailability";
import { AvailabilityCacheService } from "./AvailabilityCacheService";

const mockRedisService = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
};

vi.mock("@calcom/features/di/containers/Redis", () => ({
  getRedisService: vi.fn(() => mockRedisService),
}));

vi.mock("@calcom/features/di/containers/BusyTimes", () => ({
  getBusyTimesService: vi.fn(() => ({
    getBusyTimes: vi.fn().mockResolvedValue([]),
  })),
}));

vi.mock("@calcom/lib/holidays", () => ({
  getHolidayService: vi.fn(() => ({
    getHolidayDatesInRange: vi.fn().mockResolvedValue([]),
  })),
}));

const mockDependencies: any = {
  oooRepo: { findUserOOODays: vi.fn().mockResolvedValue([]) },
  bookingRepo: { findAcceptedBookingByEventTypeId: vi.fn().mockResolvedValue([]) },
  eventTypeRepo: { findByIdForUserAvailability: vi.fn().mockResolvedValue(null) },
  holidayRepo: { findUserSettingsSelect: vi.fn().mockResolvedValue(null) },
};

const createMockUser = () => ({
  id: 1,
  username: "testuser",
  email: "test@example.com",
  bufferTime: 0,
  timeZone: "UTC",
  availability: [],
  timeFormat: 12,
  defaultScheduleId: 1,
  schedules: [{
    id: 1,
    availability: [{ days: [1, 2, 3, 4, 5], startTime: new Date("1970-01-01T09:00:00Z"), endTime: new Date("1970-01-01T17:00:00Z") }],
    timeZone: "UTC",
  }],
  credentials: [],
  allSelectedCalendars: [],
  userLevelSelectedCalendars: [],
  travelSchedules: [],
});

describe("UserAvailabilityService Caching", () => {
  let service: UserAvailabilityService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new UserAvailabilityService(mockDependencies);
  });

  it("should serve from cache when shouldServeCache is true and cache hit occurs", async () => {
    const user = createMockUser();
    const dateFrom = dayjs("2025-01-06T09:00:00Z");
    const dateTo = dayjs("2025-01-06T17:00:00Z");

    const cachedResult = {
      busy: [],
      timeZone: "UTC",
      dateRanges: [{ start: "2025-01-06T09:00:00.000Z", end: "2025-01-06T17:00:00.000Z" }],
      oooExcludedDateRanges: [],
      workingHours: [],
      dateOverrides: [],
      currentSeats: [],
      datesOutOfOffice: [],
    };

    // First call to get version, second to get cached data
    mockRedisService.get.mockResolvedValueOnce(1); // version
    mockRedisService.get.mockResolvedValueOnce(cachedResult); // cached data

    const result = await (service as any)._getUserAvailability({
      userId: user.id,
      dateFrom,
      dateTo,
      shouldServeCache: true,
      returnDateOverrides: false,
    }, { user });

    expect(result.dateRanges[0].start.toISOString()).toBe("2025-01-06T09:00:00.000Z");
    expect(mockRedisService.get).toHaveBeenCalledTimes(2);
  });

  it("should calculate and cache result when shouldServeCache is true and cache miss occurs", async () => {
    const user = createMockUser();
    const dateFrom = dayjs("2025-01-06T09:00:00Z");
    const dateTo = dayjs("2025-01-06T17:00:00Z");

    mockRedisService.get.mockResolvedValueOnce(1); // version
    mockRedisService.get.mockResolvedValueOnce(null); // cache miss

    await (service as any)._getUserAvailability({
      userId: user.id,
      dateFrom,
      dateTo,
      shouldServeCache: true,
      returnDateOverrides: false,
    }, { user });

    expect(mockRedisService.set).toHaveBeenCalled();
  });

  it("should bypass cache when shouldServeCache is false", async () => {
    const user = createMockUser();
    const dateFrom = dayjs("2025-01-06T09:00:00Z");
    const dateTo = dayjs("2025-01-06T17:00:00Z");

    await (service as any)._getUserAvailability({
      userId: user.id,
      dateFrom,
      dateTo,
      shouldServeCache: false,
      returnDateOverrides: false,
    }, { user });

    expect(mockRedisService.get).not.toHaveBeenCalled();
  });

  it("should invalidate cache by incrementing version", async () => {
    mockRedisService.get.mockResolvedValueOnce(5); // current version
    
    await AvailabilityCacheService.invalidateUserAvailability(1);

    expect(mockRedisService.set).toHaveBeenCalledWith("user-avail-version:1", 6);
  });
});
