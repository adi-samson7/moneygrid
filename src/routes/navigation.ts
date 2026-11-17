import {
  BarChart3,
  CalendarDays,
  LayoutDashboard,
  ReceiptText,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'

export interface NavChild {
  label: string
  to: string
}

export interface NavItem {
  label: string
  to: string
  icon: LucideIcon
  children?: NavChild[]
}

// Subscriptions and Policies stay visually and functionally separate (PRD 3.1).
export const navigation: NavItem[] = [
  { label: 'Dashboard', to: '/', icon: LayoutDashboard },
  {
    label: 'Subscriptions',
    to: '/subscriptions',
    icon: ReceiptText,
    children: [
      { label: 'Overview', to: '/subscriptions' },
      { label: 'All Subscriptions', to: '/subscriptions/all' },
      { label: 'Upcoming Payments', to: '/subscriptions/upcoming' },
      { label: 'Payment History', to: '/subscriptions/history' },
    ],
  },
  {
    label: 'Policies',
    to: '/policies',
    icon: ShieldCheck,
    children: [
      { label: 'Overview', to: '/policies' },
      { label: 'All Policies', to: '/policies/all' },
      { label: 'Upcoming Renewals', to: '/policies/renewals' },
      { label: 'Policy Details', to: '/policies/details' },
    ],
  },
  { label: 'Calendar', to: '/calendar', icon: CalendarDays },
  { label: 'Analytics', to: '/analytics', icon: BarChart3 },
  { label: 'Settings', to: '/settings', icon: Settings },
]
