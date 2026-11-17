import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { FormField } from '@/components/common/FormField'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { resetPasswordSchema, type ResetPasswordInput } from '@/schemas/auth.schema'
import { authService, getAuthErrorMessage } from '@/services/auth.service'

export default function ResetPasswordPage() {
  const [params] = useSearchParams()
  // Firebase reset links carry the code as "oobCode"; the mock service uses "token".
  const token = params.get('oobCode') ?? params.get('token')
  const navigate = useNavigate()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({ resolver: zodResolver(resetPasswordSchema) })

  const onSubmit = async ({ password }: ResetPasswordInput) => {
    if (!token) return
    try {
      await authService.confirmPasswordReset(token, password)
      toast.success('Password updated. You can now log in.')
      navigate('/login', { replace: true })
    } catch (error) {
      toast.error(getAuthErrorMessage(error))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Choose a new password</CardTitle>
        <CardDescription>Use at least 8 characters.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {token ? (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              label="New password"
              type="password"
              autoComplete="new-password"
              error={errors.password?.message}
              {...register('password')}
            />
            <FormField
              label="Confirm new password"
              type="password"
              autoComplete="new-password"
              error={errors.confirmPassword?.message}
              {...register('confirmPassword')}
            />
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Update password'}
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            This reset link is missing its token.{' '}
            <Link to="/forgot-password" className="text-primary underline-offset-4 hover:underline">
              Request a new one
            </Link>
          </p>
        )}
      </CardContent>
    </Card>
  )
}
