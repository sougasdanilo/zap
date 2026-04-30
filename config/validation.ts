import { env } from './env'

export function validateEnvironment(): void {
  const errors: string[] = []

  if (!env.JWT_SECRET) {
    errors.push('JWT_SECRET environment variable is required')
  }

  if (!env.MONGODB_URI) {
    errors.push('MONGODB_URI environment variable is required')
  }

  if (errors.length > 0) {
    console.error('Environment validation failed:')
    errors.forEach(error => console.error(`  - ${error}`))
    console.error('\nPlease check your .env file and ensure all required variables are set.')
    process.exit(1)
  }

  console.log('Environment validation passed')
}
