import {
  getCalendarCredentials,
  getConnectedCalendars,
} from "@calcom/features/calendars/lib/CalendarManager";
import { buildNonDelegationCredentials } from "@calcom/lib/delegationCredential";
import { CredentialRepository } from "@calcom/features/credentials/repositories/CredentialRepository";
import { prisma } from "@calcom/prisma";
import { credentialForCalendarServiceSelect } from "@calcom/prisma/selects/credential";
import type { TrpcSessionUser } from "@calcom/trpc/server/types";

import { checkIfOrgNeedsUpgradeHandler } from "../organizations/checkIfOrgNeedsUpgrade.handler";
import { getUpgradeableHandler } from "../teams/getUpgradeable.handler";
import { checkInvalidAppCredentials } from "./checkForInvalidAppCredentials";
import { getDueInvoiceBannerDataHandler } from "./getDueInvoiceBannerData.handler";
import { shouldVerifyEmailHandler } from "./shouldVerifyEmail.handler";

type Props = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
  };
};

const checkInvalidGoogleCalendarCredentials = async ({ ctx }: Props) => {
  const nonDelegationCredentials =
    await CredentialRepository.findNonDelegationCredentialsForCalendarServiceByUserIdAndType({
      userId: ctx.user.id,
      type: "google_calendar",
    });

  const calendarCredentials = getCalendarCredentials(nonDelegationCredentials);

  const { connectedCalendars } = await getConnectedCalendars(
    calendarCredentials,
    ctx.user.userLevelSelectedCalendars,
    ctx.user.destinationCalendar?.externalId
  );

  return connectedCalendars.some((calendar) => !!calendar.error);
};

export const getUserTopBannersHandler = async ({ ctx }: Props) => {
  const upgradeableTeamMememberships = getUpgradeableHandler({ userId: ctx.user.id });
  const upgradeableOrgMememberships = checkIfOrgNeedsUpgradeHandler({ ctx });
  const shouldEmailVerify = shouldVerifyEmailHandler({ ctx });
  // const isInvalidCalendarCredential = checkInvalidGoogleCalendarCredentials({ ctx });
  const appsWithInavlidCredentials = checkInvalidAppCredentials({ ctx });
  const dueInvoiceBannerData = getDueInvoiceBannerDataHandler({ ctx });

  const [
    teamUpgradeBanner,
    orgUpgradeBanner,
    verifyEmailBanner,
    // calendarCredentialBanner,
    invalidAppCredentialBanners,
    dueInvoiceBanner,
  ] = await Promise.allSettled([
    upgradeableTeamMememberships,
    upgradeableOrgMememberships,
    shouldEmailVerify,
    // isInvalidCalendarCredential,
    appsWithInavlidCredentials,
    dueInvoiceBannerData,
  ]);

  return {
    teamUpgradeBanner: teamUpgradeBanner.status === "fulfilled" ? teamUpgradeBanner.value : [],
    orgUpgradeBanner: orgUpgradeBanner.status === "fulfilled" ? orgUpgradeBanner.value : [],
    verifyEmailBanner: verifyEmailBanner.status === "fulfilled" ? !verifyEmailBanner.value.isVerified : false,
    calendarCredentialBanner: false,
    invalidAppCredentialBanners:
      invalidAppCredentialBanners.status === "fulfilled" ? invalidAppCredentialBanners.value : [],
    dueInvoiceBanner: dueInvoiceBanner.status === "fulfilled" ? dueInvoiceBanner.value : [],
  };
};
