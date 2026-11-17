import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { FormField } from '@/components/common/FormField'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { forgotPasswordSchema, type ForgotPasswordInput } from '@/schemas/auth.schema'
import { authService, getAuthErrorMessage } from '@/services/auth.service'

export default function ForgotPasswordPage() {
  // The mock service cannot send email, so it hands back the reset link token to show on screen.
  const [submitted, setSubmitted] = useState<{ mockResetToken?: string } | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) })

  const onSubmit = async ({ email }: ForgotPasswordInput) => {
    try {
      setSubmitted(await authService.sendPasswordReset(email))
    } catch (error) {
      toast.error(getAuthErrorMessage(error))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reset password</CardTitle>
        <CardDescription>Enter your email and we will send you a reset link.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {submitted ? (
          <div className="space-y-3 text-sm">
            {/* Same message whether or not the account exists. */}
            <p>If an account exists for that email, a reset link has been sent.</p>
            {submitted.mockResetToken && (
              <p className="rounded-lg border border-dashed p-3 text-muted-foreground">
                Demo mode: no email is sent.{' '}
                <Link
                  to={`/reset-password?token=${submitted.mockResetToken}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  Open your reset link
                </Link>
              </p>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              label="Email"
              type="email"
              autoComplete="email"
              error={errors.email?.message}
              {...register('email')}
            />
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Sending…' : 'Send reset link'}
            </Button>
          </form>
        )}
        <p className="text-center text-sm text-muted-foreground">
          <Link to="/login" className="text-primary underline-offset-4 hover:underline">
            Back to log in
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
