import { z } from 'zod/v4'

export const EnvironmentSchema = z.object({
  TRANSACTIONS_SERVER_ENDPOINT: z.url(),
})

export type Environment = z.infer<typeof EnvironmentSchema>

function initEnvironment(): Environment {
  const env = {
    TRANSACTIONS_SERVER_ENDPOINT: process.env
      .TRANSACTIONS_SERVER_ENDPOINT as string,
  }

  return EnvironmentSchema.parse(env, { reportInput: true })
}

class EnvironmentService {
  private static environment: Environment = initEnvironment()

  static getEnvironment(): Environment {
    return this.environment
  }
}

export default EnvironmentService
