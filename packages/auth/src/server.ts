import { execFileSync } from "node:child_process";

import type { PrismaClient } from "@repo/db";
import {
  sendPasswordResetEmail,
  sendSignUpAttemptEmail,
  sendWelcomeEmail,
} from "@repo/transactional";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { bearer } from "better-auth/plugins/bearer";
import { username } from "better-auth/plugins/username";
import type { BetterAuthPlugin } from "better-auth/types";

const getPortlessUrl = (name: string) => {
  try {
    return execFileSync("portless", ["get", name], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
};

const resolveBaseUrl = (): string => {
  if (process.env.NODE_ENV === "production") {
    return process.env.BETTER_AUTH_URL || "http://localhost:4000";
  }
  return getPortlessUrl("lyrikos.api") ?? process.env.BETTER_AUTH_URL ?? "http://localhost:4000";
};

const defaultTrustedOrigins = () => {
  const origins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:4000",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:4000",
  ];

  const portlessNames = ["lyrikos.web", "lyrikos.api"];
  for (const name of portlessNames) {
    const url = getPortlessUrl(name);
    if (url) {
      origins.push(url);
    }
  }

  return origins;
};

type AuthConfig = {
  extraPlugins?: Array<BetterAuthPlugin>;
  fromEmail?: string;
  prisma: PrismaClient;
  resendApiKey?: string;
  secret: string;
};

export const createAuth = (config: AuthConfig) => {
  const {
    extraPlugins = [],
    fromEmail = "noreply@lyrikos.example.com",
    prisma,
    resendApiKey,
    secret,
  } = config;

  return betterAuth({
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ["email"],
      },
    },

    advanced: {
      cookiePrefix: "lyrikos",
      cookies: {
        session_token: {
          attributes: {
            httpOnly: true,
            sameSite: "lax",
            // Gate on whether BETTER_AUTH_URL is HTTPS, not on NODE_ENV.
            // `secure: true` over HTTP makes browsers silently drop the cookie.
            secure: process.env.BETTER_AUTH_URL?.startsWith("https://") === true,
          },
          name: "session_token",
        },
      },
    },

    // Explicit to match the Next.js route handler mount at /api/auth/[...all].
    // This is Better Auth's default but stated explicitly to match sibling repos.
    basePath: "/api/auth",

    baseURL: resolveBaseUrl(),

    database: prismaAdapter(prisma, {
      provider: "postgresql",
    }),

    emailAndPassword: {
      enabled: true,
      maxPasswordLength: 128,
      minPasswordLength: 12,
      // requireEmailVerification activates Better Auth's enumeration-prevention
      // path — signing up with an already-registered email returns a synthetic
      // success response. onExistingUserSignUp below notifies the real account
      // holder so they're not left waiting for a verification email that won't
      // arrive. See better-auth docs "Email Enumeration Protection".
      onExistingUserSignUp: resendApiKey
        ? async ({ user }, request) => {
            const origin = request?.headers.get("origin") ?? "";
            const result = await sendSignUpAttemptEmail(
              {
                resetPasswordUrl: `${origin}/recover`,
                signInUrl: `${origin}/login`,
                userEmail: user.email,
                username: user.name,
              },
              { apiKey: resendApiKey, from: fromEmail },
            );
            if (!result.success) {
              // Don't throw — Better Auth's enumeration-prevention path needs
              // to return success regardless. Log so delivery failures don't
              // break the auth response.
              console.error("[Auth] Failed to send sign-up attempt email:", result.error);
            }
          }
        : undefined,
      // Gate on Resend availability rather than NODE_ENV. If no API key is
      // configured we physically can't send a verification email — requiring
      // verification under that condition would lock all new users out.
      requireEmailVerification: Boolean(resendApiKey),
      sendResetPassword: resendApiKey
        ? async ({ url, user }) => {
            const result = await sendPasswordResetEmail(
              {
                resetUrl: url,
                userEmail: user.email,
                username: user.name,
              },
              { apiKey: resendApiKey, from: fromEmail },
            );
            if (!result.success) {
              throw new Error(`Failed to send password reset email: ${result.error}`);
            }
          }
        : undefined,
    },

    emailVerification: {
      sendVerificationEmail: resendApiKey
        ? async ({ url, user }) => {
            const result = await sendWelcomeEmail(
              {
                userEmail: user.email,
                username: user.name,
                verificationUrl: url,
              },
              { apiKey: resendApiKey, from: fromEmail },
            );
            if (!result.success) {
              throw new Error(`Failed to send verification email: ${result.error}`);
            }
          }
        : undefined,
    },

    plugins: [username(), bearer(), ...extraPlugins],

    rateLimit: {
      enabled: process.env.NODE_ENV === "production",
      max: 10,
      storage: "database",
      window: 60,
    },

    secret,

    session: {
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60, // 5 minutes
      },
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // Update if older than 1 day
    },
    trustedOrigins: process.env.TRUSTED_ORIGINS?.split(",") || defaultTrustedOrigins(),
    user: {
      additionalFields: {
        displayName: {
          defaultValue: null,
          required: false,
          type: "string",
        },
      },
    },
  });
};

export type Auth = ReturnType<typeof createAuth>;
export type { AuthConfig };
