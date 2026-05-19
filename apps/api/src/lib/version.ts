import { sha256 } from "hono/utils/crypto";

export const computeResearchVersion = ({
  modelId,
  promptVersion,
  sourceContentHash,
}: {
  modelId: string;
  promptVersion: string;
  sourceContentHash: string;
}) => sha256(`${modelId}|${promptVersion}|${sourceContentHash}`);
