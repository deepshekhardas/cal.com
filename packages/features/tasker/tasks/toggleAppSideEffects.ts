import { z } from "zod";
import { getLocalAppMetadata } from "@calcom/app-store/utils";
import { sendDisabledAppEmail } from "@calcom/emails/integration-email-service";
import { getTranslation } from "@calcom/lib/server/i18n";
import { prisma } from "@calcom/prisma";
import { AppCategories } from "@calcom/prisma/enums";
import logger from "@calcom/lib/logger";
import { safeStringify } from "@calcom/lib/safeStringify";

const log = logger.getSubLogger({ prefix: ["toggleAppSideEffects"] });

export const toggleAppSideEffectsPayloadSchema = z.object({
    slug: z.string(),
    enabled: z.boolean(),
});

export async function toggleAppSideEffects(payload: string): Promise<void> {
    try {
        const { slug, enabled } = toggleAppSideEffectsPayloadSchema.parse(JSON.parse(payload));

        log.debug(`Processing toggleAppSideEffects task for app ${slug}, enabled: ${enabled}`);

        // If enabling an app, we don't have side effects for now as per toggle.handler.ts
        // In toggle.handler.ts, logic is only inside if (!enabled)
        if (enabled) {
            log.debug(`App ${slug} enabled, no side effects to process.`);
            return;
        }

        const app = await prisma.app.findUnique({
            where: { slug },
            select: { categories: true, slug: true },
        });

        if (!app) {
            log.error(`App ${slug} not found in database`);
            return;
        }

        const localApps = getLocalAppMetadata();
        const appMetadata = localApps.find((localApp) => localApp.slug === slug);

        const translations = new Map();
        if (
            app.categories.some((category) =>
                (
                    [AppCategories.calendar, AppCategories.video, AppCategories.conferencing] as AppCategories[]
                ).includes(category as AppCategories)
            )
        ) {
            // Find all users with the app credentials
            const appCredentials = await prisma.credential.findMany({
                where: {
                    appId: app.slug,
                },
                select: {
                    user: {
                        select: {
                            email: true,
                            locale: true,
                        },
                    },
                },
            });

            await Promise.all(
                appCredentials.map(async (credential) => {
                    if (!credential.user || !credential.user.email) return;

                    const locale = credential.user.locale ?? "en";
                    let t = translations.get(locale);

                    if (!t) {
                        t = await getTranslation(locale, "common");
                        translations.set(locale, t);
                    }

                    await sendDisabledAppEmail({
                        email: credential.user.email,
                        appName: appMetadata?.name || app.slug,
                        appType: app.categories as AppCategories[],
                        t,
                    });
                })
            );
        } else {
            const eventTypesWithApp = await prisma.eventType.findMany({
                where: {
                    metadata: {
                        path: ["apps", app.slug as string, "enabled"],
                        equals: true,
                    },
                },
                select: {
                    id: true,
                    title: true,
                    users: {
                        select: {
                            email: true,
                            locale: true,
                        },
                    },
                    metadata: true,
                },
            });

            await Promise.all(
                eventTypesWithApp.map(async (eventType) => {
                    await prisma.eventType.update({
                        where: {
                            id: eventType.id,
                        },
                        data: {
                            metadata: {
                                ...(eventType.metadata as object),
                                apps: {
                                    // @ts-expect-error
                                    ...eventType.metadata?.apps,
                                    // @ts-expect-error
                                    [app.slug]: { ...eventType.metadata?.apps[app.slug], enabled: false },
                                },
                            },
                        },
                    });

                    return Promise.all(
                        eventType.users.map(async (user) => {
                            const locale = user.locale ?? "en";
                            let t = translations.get(locale);

                            if (!t) {
                                t = await getTranslation(locale, "common");
                                translations.set(locale, t);
                            }

                            await sendDisabledAppEmail({
                                email: user.email,
                                appName: appMetadata?.name || app.slug,
                                appType: app.categories as AppCategories[],
                                t,
                                title: eventType.title,
                                eventTypeId: eventType.id,
                            });
                        })
                    );
                })
            );
        }

        log.debug(`Successfully processed toggleAppSideEffects for app ${slug}`);
    } catch (error) {
        log.error(
            `Failed to process toggleAppSideEffects`,
            safeStringify({ payload, error: error instanceof Error ? error.message : String(error) })
        );
        throw error;
    }
}
