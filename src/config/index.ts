import dotenv from 'dotenv'

dotenv.config({ path: `.env.${process.env.APP_ENV}`, override: true })
dotenv.config({ path: `.env.${process.env.APP_ENV}.local`, override: true })

export const privateKey: string = process.env.PRIVATE_KEY!
export const zklinkEndpoint = process.env.ZKLINK_ENDPOINT!
