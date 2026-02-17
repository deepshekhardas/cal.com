import { describe, expect, it, vi } from "vitest";

import { ProfileRepository } from "@calcom/features/profile/repositories/ProfileRepository";

import { getEventOrganizationId } from "./RegularBookingService";

vi.mock("@calcom/features/profile/repositories/ProfileRepository");

describe("getEventOrganizationId", () => {
    const mockEventType = {
        userId: 1,
        users: [],
        team: null,
        parent: null,
    };

    it("should return organizationId if provided in input", async () => {
        const result = await getEventOrganizationId({
            eventType: mockEventType,
            organizationId: 100,
        });
        expect(result).toBe(100);
        expect(ProfileRepository.findFirstForUserId).not.toHaveBeenCalled();
    });

    it("should return team parentId if present", async () => {
        const teamEventType = {
            ...mockEventType,
            team: { parentId: 200 },
        } as any;
        const result = await getEventOrganizationId({
            eventType: teamEventType,
        });
        expect(result).toBe(200);
    });

    it("should fallback to ProfileRepository if no organizationId provided and no team parentId", async () => {
        vi.mocked(ProfileRepository.findFirstForUserId).mockResolvedValue({
            organizationId: 300,
        } as any);

        const result = await getEventOrganizationId({
            eventType: mockEventType,
        });
        expect(result).toBe(300);
        expect(ProfileRepository.findFirstForUserId).toHaveBeenCalledWith({ userId: 1 });
    });
});
