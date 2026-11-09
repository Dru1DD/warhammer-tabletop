// The only thing host/guest logic knows about the network: a message pipe. PeerJS implements it in `peer.ts`;
// tests use `memoryPair()`.

export interface Link {
  send(data: string): void
  close(): void
  /** assigned by the consumer; `data` is untrusted */
  onMessage: ((data: unknown) => void) | null
  onClose: (() => void) | null
}

/** Two linked in-memory ends. Delivery is synchronous. `cut()` makes the pipe silently swallow traffic (a dead peer). */
export function memoryPair() {
  const mk = (): Link => ({ send: () => {}, close: () => {}, onMessage: null, onClose: null })
  const a = mk()
  const b = mk()
  let open = true
  let cut = false
  const wire = (from: Link, to: Link) => {
    from.send = (d) => {
      if (open && !cut) to.onMessage?.(d)
    }
    from.close = () => {
      if (!open) return
      open = false
      to.onClose?.()
      from.onClose?.()
    }
  }
  wire(a, b)
  wire(b, a)
  return { a, b, cut: () => { cut = true }, isOpen: () => open }
}
