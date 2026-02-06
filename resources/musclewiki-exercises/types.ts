import { z } from "zod";

export const propSchema = z
  .object({
    query: z.string().describe("Search query for MuscleWiki exercises"),
  })
  .loose();

export type MuscleWikiProps = z.infer<typeof propSchema>;
