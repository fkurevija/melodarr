import { redirect } from "next/navigation";
import { isAppInitialized } from "@/lib/app-state";
import { getCurrentUser } from "@/lib/auth/server";
import { withBasePath } from "@/lib/navigation/base-path";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const initialized = await isAppInitialized();
  if (!initialized) {
    redirect(withBasePath("/setup"));
  }

  const user = await getCurrentUser();
  redirect(withBasePath(user ? "/discover" : "/login"));
}
