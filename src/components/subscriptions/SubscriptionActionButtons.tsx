import { useState } from 'react'
import { Ban, Pause, Pencil, Play, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { useSubscriptionsStore } from '@/stores/subscriptions.store'
import type { Subscription, SubscriptionStatus } from '@/types/subscription'

interface SubscriptionActionButtonsProps {
  subscription: Subscription
  onEdit: () => void
  /** Called after the subscription is deleted (e.g. to leave its detail page). */
  onDeleted?: () => void
}

/** Edit, pause/resume, cancel and delete for one subscription. Cancel and delete ask for confirmation. */
export function SubscriptionActionButtons({ subscription, onEdit, onDeleted }: SubscriptionActionButtonsProps) {
  const setStatus = useSubscriptionsStore((s) => s.setStatus)
  const remove = useSubscriptionsStore((s) => s.remove)
  const [confirming, setConfirming] = useState<'cancel' | 'delete' | null>(null)
  const { id, name, status } = subscription

  const changeStatus = async (next: SubscriptionStatus, message: string) => {
    await setStatus(id, next)
    toast.success(message)
  }

  const quickChange = async (next: SubscriptionStatus, message: string) => {
    try {
      await changeStatus(next, message)
    } catch (error) {
      console.error(error)
      toast.error('Could not update the subscription. Please try again.')
    }
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Button variant="ghost" size="icon" aria-label={`Edit ${name}`} title="Edit" onClick={onEdit}>
        <Pencil />
      </Button>
      {status === 'active' && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Pause ${name}`}
          title="Pause"
          onClick={() => quickChange('paused', `${name} paused`)}
        >
          <Pause />
        </Button>
      )}
      {status === 'paused' && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Resume ${name}`}
          title="Resume"
          onClick={() => quickChange('active', `${name} resumed`)}
        >
          <Play />
        </Button>
      )}
      {(status === 'active' || status === 'paused') && (
        <Button variant="ghost" size="icon" aria-label={`Cancel ${name}`} title="Cancel" onClick={() => setConfirming('cancel')}>
          <Ban />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="text-destructive hover:text-destructive"
        aria-label={`Delete ${name}`}
        title="Delete"
        onClick={() => setConfirming('delete')}
      >
        <Trash2 />
      </Button>

      <ConfirmDialog
        open={confirming === 'cancel'}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={`Cancel ${name}?`}
        description="It will stop counting toward your recurring spend and no new payments will be tracked. Your payment history is kept."
        confirmLabel="Cancel subscription"
        destructive
        onConfirm={() => changeStatus('cancelled', `${name} cancelled`)}
      />
      <ConfirmDialog
        open={confirming === 'delete'}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={`Delete ${name}?`}
        description="This permanently removes the subscription and all of its payment history. This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          await remove(id)
          toast.success(`${name} deleted`)
          onDeleted?.()
        }}
      />
    </div>
  )
}
