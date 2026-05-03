import { z } from 'zod'

export const llmConfigSchema = z.object({
  apiBaseUrl: z.string().min(1),
  model: z.string().min(1),
  apiKey: z.string().min(1).optional()
})

export type LlmConfigInput = z.infer<typeof llmConfigSchema>
