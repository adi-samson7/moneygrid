import { useState } from 'react'
import { Ban, Pencil, Play, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { usePoliciesStore } from '@/stores/policies.store'
import type { Policy } from '@/types/policy'
import { RenewPolicyDialog } from './RenewPolicyDialog'

interface PolicyActionButtonsProps {
  policy: Policy
  onEdit: () => void
  /** Called after the policy is deleted (e.g. to leave its detail page). */
  onDeleted?: () => void
}

/** Edit, renew, cancel/reactivate and delete for one policy. Cancel and delete ask for confirmation. */
export function PolicyActionButtons({ policy, onEdit, onDeleted }: PolicyActionButtonsProps) {
  const setStatus = usePoliciesStore((s) => s.setStatus)
  const remove = usePoliciesStore((s) => s.remove)
  const [confirming, setConfirming] = useState<'cancel' | 'delete' | null>(null)
  const [renewing, setRenewing] = useState(false)
  const { id, policyName: name, status } = policy

  const reactivate = async () => {
    try {
      await setStatus(id, 'active')
      toast.success(`${name} reactivated`)
    } catch (error) {
      console.error(error)
      toast.error('Could not update the policy. Please try again.')
    }
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Button variant="ghost" size="icon" aria-label={`Edit ${name}`} title="Edit" onClick={onEdit}>
        <Pencil />
      </Button>
      {status === 'active' && (
        <Button variant="ghost" size="icon" aria-label={`Renew ${name}`} title="Renew" onClick={() => setRenewing(true)}>
          <RefreshCw />
        </Button>
      )}
      {status === 'active' ? (
        <Button variant="ghost" size="icon" aria-label={`Cancel ${name}`} title="Cancel" onClick={() => setConfirming('cancel')}>
          <Ban />
        </Button>
      ) : (
        <Button variant="ghost" size="icon" aria-label={`Reactivate ${name}`} title="Reactivate" onClick={reactivate}>
          <Play />
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

      <RenewPolicyDialog policy={renewing ? policy : null} onClose={() => setRenewing(false)} />
      <ConfirmDialog
        open={confirming === 'cancel'}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={`Cancel ${name}?`}
        description="No further premiums will be tracked and it stops counting toward your active policies. Your premium and renewal history is kept."
        confirmLabel="Cancel policy"
        destructive
        onConfirm={async () => {
          await setStatus(id, 'cancelled')
          toast.success(`${name} cancelled`)
        }}
      />
      <ConfirmDialog
        open={confirming === 'delete'}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={`Delete ${name}?`}
        description="This permanently removes the policy, its premium history and its renewal history. This cannot be undone."
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
