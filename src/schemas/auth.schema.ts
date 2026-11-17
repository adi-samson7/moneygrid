import { z } from 'zod'
import { CURRENCIES } from '@/utils/currency'

const email = z.email('Enter a valid email address')
const password = z.string().min(8, 'Password must be at least 8 characters')

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password'),
})
export type LoginInput = z.infer<typeof loginSchema>

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(1, 'Enter your name').max(80, 'Name is too long'),
    email,
    password,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
export type RegisterInput = z.infer<typeof registerSchema>

export const forgotPasswordSchema = z.object({ email })
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>

export const resetPasswordSchema = z
  .object({ password, confirmPassword: z.string() })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>

export const profileSchema = z.object({
  fullName: z.string().trim().min(1, 'Enter your name').max(80, 'Name is too long'),
  preferredCurrency: z.enum(CURRENCIES),
  timeZone: z.string().min(1, 'Choose a time zone'),
})
export type ProfileInput = z.infer<typeof profileSchema>
