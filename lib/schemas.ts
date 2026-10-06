import { z } from "zod";

export const ArticleInput = z.object({
  title: z.string().trim().min(1),
  body: z.string().trim().min(1),
  category: z.string().trim().min(1).default("General"),
});

export const ProcedureInput = z.object({
  name: z.string().trim().min(1),
  trigger: z.string().trim().min(1),
  instructions: z.string().trim().min(1),
  enabled: z.boolean().default(true),
});
