import { randomBytes } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { getStoredRuntimeFields } from "@/lib/runtime/app-config";

let cachedSecret: string | null = null;

const saveRuntimeSecret = async (secret: string) => {
  await prisma.appConfig.upsert({
    where: { id: 1 },
    update: { runtimeSecret: secret },
    create: { id: 1, runtimeSecret: secret }
  });
};

export const getRuntimeSecret = async (): Promise<string> => {
  const envSecret = env.sessionSecret?.trim();
  if (envSecret) {
    if (!cachedSecret) {
      cachedSecret = envSecret;
      const stored = await getStoredRuntimeFields();
      if (!stored.runtimeSecret) {
        await saveRuntimeSecret(envSecret);
      }
    }

    return envSecret;
  }

  if (cachedSecret) {
    return cachedSecret;
  }

  const stored = await getStoredRuntimeFields();
  const storedSecret = stored.runtimeSecret?.trim();
  if (storedSecret) {
    cachedSecret = storedSecret;
    return cachedSecret;
  }

  if (stored.jellyfinApiKeyEncrypted || stored.lidarrApiKeyEncrypted) {
    throw new Error(
      "Cannot generate a runtime secret while encrypted settings exist. Restore the previous SESSION_SECRET or re-enter the API keys in Settings."
    );
  }

  const created = randomBytes(64).toString("hex");
  await saveRuntimeSecret(created);
  cachedSecret = created;
  return created;
};
