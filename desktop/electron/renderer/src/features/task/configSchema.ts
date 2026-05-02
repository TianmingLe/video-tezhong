import { z } from 'zod'

export const scriptEnum = z.enum(['mock_device.py', 'firmware_build.py', 'e2e_test.py'])
export const logLevelEnum = z.enum(['info', 'warn', 'error'])

export const taskConfigSchema = z.object({
  runId: z.string().optional().default(''),
  script: scriptEnum,
  scenario: z.string().min(1),
  gatewayWs: z.string().optional().default(''),
  env: z.record(z.string()).default({}),
  advanced: z.object({
    logLevel: logLevelEnum.default('info'),
    maxLogLines: z.number().int().min(100).max(10000).default(1000),
    autoJumpToReport: z.boolean().default(true)
  })
})

export type TaskConfig = z.infer<typeof taskConfigSchema>

