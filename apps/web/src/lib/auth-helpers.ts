import { headers } from "next/headers";
import { cache } from "react";

import { getAuth } from "./auth";

export const getSession = cache(async () => {
  const headersList = await headers();

  try {
    const session = await getAuth().api.getSession({
      headers: headersList,
    });

    return session;
  } catch (error) {
    console.error("[auth-helpers] getSession failed", { error });
    return null;
  }
});
