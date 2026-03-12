import { createHash } from "node:crypto";
import { getRedisService } from "@calcom/features/di/containers/Redis";
import logger from "@calcom/lib/logger";
import { safeStringify } from "@calcom/lib/safeStringify";

const log = logger.getSubLogger({ prefix: ["AvailabilityCacheService"] });

export class AvailabilityCacheService {
  private static readonly VERSION_KEY_PREFIX = "user-avail-version:";
  private static readonly AVAIL_KEY_PREFIX = "user-avail:";
  private static readonly DEFAULT_TTL_MS = 3600 * 1000; // 1 hour

  static async getUserAvailabilityVersion(userId: number): Promise<number> {
    try {
      const redis = getRedisService();
      const key = `${this.VERSION_KEY_PREFIX}${userId}`;
      const version = await redis.get<number>(key);
      return version ?? 1;
    } catch (error) {
      log.warn(`Failed to fetch availability version for user ${userId}, falling back to default`, error);
      return 1;
    }
  }

  static async invalidateUserAvailability(userId: number): Promise<void> {
    try {
      const redis = getRedisService();
      const key = `${this.VERSION_KEY_PREFIX}${userId}`;
      const currentVersion = await this.getUserAvailabilityVersion(userId);
      await redis.set(key, currentVersion + 1);
      log.debug(`Invalidated availability cache for user ${userId}. New version: ${currentVersion + 1}`);
    } catch (error) {
      log.error(`Failed to invalidate availability cache for user ${userId}`, error);
    }
  }

  static generateCacheKey(userId: number, version: number, params: any): string {
    const paramsString = safeStringify(params);
    const hash = createHash("md5").update(paramsString).digest("hex");
    return `${this.AVAIL_KEY_PREFIX}v${version}:${userId}:${hash}`;
  }

  static async getCachedAvailability<T>(key: string): Promise<T | null> {
    try {
      const redis = getRedisService();
      return await redis.get<T>(key);
    } catch (error) {
      log.warn(`Failed to get cached availability for key ${key}`, error);
      return null;
    }
  }

  static async setCachedAvailability<T>(key: string, data: T, ttlMs: number = this.DEFAULT_TTL_MS): Promise<void> {
    try {
      const redis = getRedisService();
      await redis.set(key, data, { ttl: ttlMs });
    } catch (error) {
      log.warn(`Failed to set cached availability for key ${key}`, error);
    }
  }
}
