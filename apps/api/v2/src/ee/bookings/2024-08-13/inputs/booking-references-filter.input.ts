import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsIn, IsOptional } from "class-validator";

export const BookingReferences = [
  "google_calendar",
  "office365_calendar",
  "daily_video",
  "google_video",
  "office365_video",
  "zoom_video",
] as const;

export class BookingReferencesFilterInput_2024_08_13 {
  @ApiProperty({
    description: "Filter booking references by type(s)",
    required: false,
    enum: BookingReferences,
    isArray: true,
    example: ["google_calendar", "google_video"],
  })
  @IsOptional()
  @IsArray()
  @IsIn(BookingReferences, { each: true })
  type?: (typeof BookingReferences)[number][];
}
