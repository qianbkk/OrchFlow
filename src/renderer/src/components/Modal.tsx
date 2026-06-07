import { ReactNode } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  onClose: () => void
  title?: string
  widthClass?: string
  /** HeightClass for the inner card. Defaults to auto. */
  heightClass?: string
  children: ReactNode
}

/** Centered modal with backdrop + click-outside-to-close. */
export function Modal({
  onClose,
  title,
  widthClass = 'max-w-lg',
  heightClass,
  children
}: ModalProps): React.JSX.Element {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={`flex w-full ${widthClass} ${
          heightClass ?? 'flex-col'
        } rounded-lg border border-[var(--color-border-1)] bg-[var(--color-bg-1)] shadow-2xl`}
      >
        {title !== undefined && (
          <div className="flex items-center justify-between border-b border-[var(--color-border-1)] px-4 py-3">
            <h3 className="font-semibold">{title}</h3>
            <button
              onClick={onClose}
              className="rounded p-1 text-[var(--color-text-1)] hover:bg-[var(--color-bg-3)]"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
