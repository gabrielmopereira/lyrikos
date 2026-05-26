"use server";

import { cookies } from "next/headers";

import { TARGET_LANGUAGE_COOKIE } from "@/lib/language";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year
const VALID_LANG = /^[a-zA-Z]{2,3}(-[a-zA-Z]{2,4})?$/v;

const setTargetLang = async (code: string): Promise<void> => {
  if (!VALID_LANG.test(code)) {
    throw new Error(`Invalid language code: ${code}`);
  }

  const cookieStore = await cookies();

  cookieStore.set(TARGET_LANGUAGE_COOKIE, code, {
    httpOnly: true,
    maxAge: COOKIE_MAX_AGE,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
};

export { setTargetLang };
