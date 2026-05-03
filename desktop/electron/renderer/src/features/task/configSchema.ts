import { z } from 'zod'

export const scriptEnum = z.enum(['mock_device.py', 'firmware_build.py', 'e2e_test.py', 'mediacrawler'])
export const logLevelEnum = z.enum(['info', 'warn', 'error'])

const mediacrawlerSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('dy_mvp'),
    specifiedId: z.string().min(1),
    enableLlm: z.boolean().default(false)
  }),
  z.object({
    kind: z.literal('xhs_search'),
    keywords: z.string().min(1),
    limit: z.number().int().min(1).max(50).default(10),
    enableLlm: z.boolean().default(false)
  }),
  z.object({
    kind: z.literal('bili_search'),
    keywords: z.string().min(1),
    limit: z.number().int().min(1).max(50).default(10),
    enableLlm: z.boolean().default(false)
  })
])

export const taskConfigSchema = z
  .object({
    runId: z.string().optional().default(''),
    script: scriptEnum,
    scenario: z.string().min(1),
    gatewayWs: z.string().optional().default(''),
    env: z.record(z.string()).default({}),
    mediacrawler: mediacrawlerSchema.optional(),
    retry: z.object({ maxAttempts: z.number().int().min(1).max(5).default(1) }).default({ maxAttempts: 1 }),
    limits: z.object({ timeoutMs: z.number().int().min(0).max(86400000).default(0) }).default({ timeoutMs: 0 }),
    advanced: z.object({
      logLevel: logLevelEnum.default('info'),
      maxLogLines: z.number().int().min(100).max(10000).default(1000),
      autoJumpToReport: z.boolean().default(true)
    })
  })
  .superRefine((v, ctx) => {
    if (v.script === 'mediacrawler' && !v.mediacrawler) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'mediacrawler is required', path: ['mediacrawler'] })
    }
  })

export type TaskConfig = z.infer<typeof taskConfigSchema>
