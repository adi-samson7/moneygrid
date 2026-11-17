import { lazy } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import { RouteError } from '@/components/common/RouteError'
import { AppLayout } from '@/components/layout/AppLayout'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { ProtectedRoute, PublicOnlyRoute } from './guards'

const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage'))
const SubscriptionsOverviewPage = lazy(() => import('@/pages/subscriptions/SubscriptionsOverviewPage'))
const AllSubscriptionsPage = lazy(() => import('@/pages/subscriptions/AllSubscriptionsPage'))
const UpcomingPaymentsPage = lazy(() => import('@/pages/subscriptions/UpcomingPaymentsPage'))
const PaymentHistoryPage = lazy(() => import('@/pages/subscriptions/PaymentHistoryPage'))
const SubscriptionDetailsPage = lazy(() => import('@/pages/subscriptions/SubscriptionDetailsPage'))
const PoliciesOverviewPage = lazy(() => import('@/pages/policies/PoliciesOverviewPage'))
const AllPoliciesPage = lazy(() => import('@/pages/policies/AllPoliciesPage'))
const UpcomingRenewalsPage = lazy(() => import('@/pages/policies/UpcomingRenewalsPage'))
const PolicyDirectoryPage = lazy(() => import('@/pages/policies/PolicyDirectoryPage'))
const PolicyDetailsPage = lazy(() => import('@/pages/policies/PolicyDetailsPage'))
const CalendarPage = lazy(() => import('@/pages/calendar/CalendarPage'))
const AnalyticsPage = lazy(() => import('@/pages/analytics/AnalyticsPage'))
const SettingsPage = lazy(() => import('@/pages/settings/SettingsPage'))
const NotificationsPage = lazy(() => import('@/pages/notifications/NotificationsPage'))
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'))
const RegisterPage = lazy(() => import('@/pages/auth/RegisterPage'))
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('@/pages/auth/ResetPasswordPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))

export const router = createBrowserRouter([
  {
    element: <AuthLayout />,
    errorElement: <RouteError />,
    children: [
      // Signed-in users are redirected away from these.
      {
        element: <PublicOnlyRoute />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/register', element: <RegisterPage /> },
          { path: '/forgot-password', element: <ForgotPasswordPage /> },
        ],
      },
      // Reachable regardless of sign-in state, since it is opened from a reset link.
      { path: '/reset-password', element: <ResetPasswordPage /> },
    ],
  },
  {
    // Everything below requires a signed-in user.
    element: <ProtectedRoute />,
    errorElement: <RouteError />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'subscriptions', element: <SubscriptionsOverviewPage /> },
          { path: 'subscriptions/all', element: <AllSubscriptionsPage /> },
          { path: 'subscriptions/upcoming', element: <UpcomingPaymentsPage /> },
          { path: 'subscriptions/history', element: <PaymentHistoryPage /> },
          { path: 'subscriptions/:id', element: <SubscriptionDetailsPage /> },
          { path: 'policies', element: <PoliciesOverviewPage /> },
          { path: 'policies/all', element: <AllPoliciesPage /> },
          { path: 'policies/renewals', element: <UpcomingRenewalsPage /> },
          { path: 'policies/details', element: <PolicyDirectoryPage /> },
          { path: 'policies/:id', element: <PolicyDetailsPage /> },
          { path: 'calendar', element: <CalendarPage /> },
          { path: 'analytics', element: <AnalyticsPage /> },
          { path: 'notifications', element: <NotificationsPage /> },
          { path: 'settings', element: <SettingsPage /> },
        ],
      },
    ],
  },
  // Anything else: a standalone 404 page.
  { path: '*', element: <NotFoundPage />, errorElement: <RouteError /> },
])
