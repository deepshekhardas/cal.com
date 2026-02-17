import { RRule } from "rrule";

import type { Dayjs } from "@calcom/dayjs";
import dayjs from "@calcom/dayjs";
import { detectBrowserTimeFormat, TimeFormat } from "@calcom/lib/timeFormat";
import type { RecurringEvent } from "@calcom/types/Calendar";

import { parseZone } from "./parse-zone";

type ExtraOptions = { withDefaultTimeFormat?: boolean; selectedTimeFormat?: TimeFormat };

const processDate = (
  date: string | null | Dayjs,
  language: string,
  timeZone: string,
  options?: ExtraOptions
) => {
  const parsedZone = parseZone(date);
  if (!parsedZone?.isValid()) return "Invalid date";
  const formattedTime = parsedZone?.format(
    options?.withDefaultTimeFormat
      ? TimeFormat.TWELVE_HOUR
      : options?.selectedTimeFormat || detectBrowserTimeFormat
  );
  return `${formattedTime}, ${dayjs(date)
    .toDate()
    .toLocaleString(language, { dateStyle: "full", timeZone })}`;
};

export const parseDate = (
  date: string | null | Dayjs,
  language: string,
  timeZone: string,
  options?: ExtraOptions
) => {
  if (!date) return ["No date"];
  return processDate(date, language, timeZone, options);
};

const timeOptions: Intl.DateTimeFormatOptions = {
  hour12: true,
  hourCycle: "h12",
  hour: "numeric",
  minute: "numeric",
};

const dateOptions: Intl.DateTimeFormatOptions = {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
};

export const parseDateTimeWithTimeZone = (
  date: Date,
  language: string,
  timezone: string,
  options?: ExtraOptions
): string => {
  timeOptions.timeZone = timezone;
  dateOptions.timeZone = timezone;

  if (options?.withDefaultTimeFormat) {
    timeOptions.hourCycle = "h12";
  } else if (options?.selectedTimeFormat) {
    timeOptions.hourCycle = options.selectedTimeFormat === TimeFormat.TWELVE_HOUR ? "h12" : "h24";
    if (timeOptions.hourCycle === "h24") {
      delete timeOptions.hour12;
    }
  }
  const formattedDate = new Date(date).toLocaleDateString(language, dateOptions);
  const formattedTime = new Date(date)
    .toLocaleTimeString(language, timeOptions)
    .replace(" ", "")
    .toLowerCase();
  return `${formattedTime}, ${formattedDate}`;
};

export const parseRecurringDates = (
  {
    startDate,
    timeZone,
    recurringEvent,
    recurringCount,
    selectedTimeFormat,
    withDefaultTimeFormat,
  }: {
    startDate: string | null | Dayjs;
    timeZone: string;
    recurringEvent: RecurringEvent | null;
    recurringCount: number;
    selectedTimeFormat?: TimeFormat;
    withDefaultTimeFormat?: boolean;
  },
  language: string
): [string[], Date[]] => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { count, ...restRecurringEvent } = recurringEvent || {};
  const rule = new RRule({
    ...restRecurringEvent,
    count: recurringCount,
    dtstart: new Date(dayjs(startDate).valueOf()),
  });

  /*
   * When using RRule, the "all()" method generates dates based on the UTC time of the "dtstart"
   * and simply adds the interval (e.g. +24 hours). It does not account for DST shifts in a specific timezone.
   * To preserve "Wall Clock Time" (e.g. always 10:00 AM locally), we must adjust the result
   * by the difference in UTC offsets between the start date and the recurrent date in the target timezone.
   */
  const startInTimeZone = dayjs(startDate).tz(timeZone);
  const startUtcOffset = startInTimeZone.utcOffset();

  const times = rule.all().map((t) => {
    // Get the offset of the generated time 't' in the target timezone
    // We use dayjs(t).tz(timeZone) to ensure we are looking at the offset in the desired location
    const currentUtcOffset = dayjs(t).tz(timeZone).utcOffset();

    // Adjust the time by the difference in offsets to maintain the same wall-clock time
    return dayjs(t).add(startUtcOffset - currentUtcOffset, "minute");
  });
  const dateStrings = times.map((t) => {
    // finally; show in local timeZone again
    return processDate(t.tz(timeZone), language, timeZone, { selectedTimeFormat, withDefaultTimeFormat });
  });

  return [dateStrings, times.map((t) => t.toDate())];
};
