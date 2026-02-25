import { getLocalAppMetadata } from "@calcom/app-store/utils";
import { sendDisabledAppEmail } from "@calcom/emails/integration-email-service";
import { getTranslation } from "@calcom/lib/server/i18n";
import type { PrismaClient } from "@calcom/prisma";
import { AppCategories } from "@calcom/prisma/enums";
import { tasker } from "@calcom/features/tasker";

import { TRPCError } from "@trpc/server";

import type { TrpcSessionUser } from "../../../types";
import type { TToggleInputSchema } from "./toggle.schema";

type ToggleOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
    prisma: PrismaClient;
  };
  input: TToggleInputSchema;
};

export const toggleHandler = async ({ input, ctx }: ToggleOptions) => {
  const { prisma } = ctx;
  const { enabled, slug } = input;

  // Get app name from metadata
  const localApps = getLocalAppMetadata();
  const appMetadata = localApps.find((localApp) => localApp.slug === slug);

  if (!appMetadata) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "App metadata could not be found" });
  }

  const app = await prisma.app.upsert({
    where: {
      slug,
    },
    update: {
      enabled,
      dirName: appMetadata?.dirName || appMetadata?.slug || "",
    },
    create: {
      slug,
      dirName: appMetadata?.dirName || appMetadata?.slug || "",
      categories:
        (appMetadata?.categories as AppCategories[]) ||
        ([appMetadata?.category] as AppCategories[]) ||
        undefined,
      keys: undefined,
      enabled,
    },
  });

  // If disabling an app then we need to alert users basesd on the app type
  if (!enabled) {
    await tasker.create("toggleAppSideEffects", {
      slug,
      enabled,
    });
  }

  return app.enabled;
};
