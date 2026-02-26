import { CustomThrottlerGuard } from "@/lib/throttler-guard";

export const mockThrottlerGuard = (): void => {
  // @ts-expect-error Protected method spying causes type errors in stricter mode
  jest.spyOn(CustomThrottlerGuard.prototype, "handleRequest").mockResolvedValue(true);
};
