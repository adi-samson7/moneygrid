/** Collection names under users/{uid}/. Shared by the services, the Firestore rules and the tests. */
export const COLLECTIONS = {
  subscriptions: 'subscriptions',
  subscriptionPayments: 'subscriptionPayments',
  policies: 'policies',
  policyPayments: 'policyPayments',
  notifications: 'notifications',
  activity: 'activity',
  /** Single document with id "details". */
  profile: 'profile',
  /** Single document with id "preferences". */
  settings: 'settings',
} as const
