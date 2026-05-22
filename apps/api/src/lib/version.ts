import { sha256 } from "hono/utils/crypto";

import { AppError } from "@/middleware/error-handler";

export const computeResearchVersion = async ({
  modelId,
  promptVersion,
  sourceContentHash,
}: {
  modelId: string;
  promptVersion: string;
  sourceContentHash: string;
}) => {
  const hash = await sha256(`${modelId}|${promptVersion}|${sourceContentHash}`);

  if (!hash) {
    throw new AppError(
      "Failed to compute research version hash",
      500,
      false,
      "TRANSLATION_HASH_ERROR",
    );
  }

  return hash;
};
