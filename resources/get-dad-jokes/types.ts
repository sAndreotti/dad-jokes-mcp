import { z } from "zod";

export const propSchema = z.object({
    id: z.string().describe("Unique identifier for the joke").optional(),
    joke: z.string().describe("Das joke text").optional(),
});

export type DadJokeProps = z.infer<typeof propSchema>;
