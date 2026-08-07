"use client"

// Presentational only. Holds no state, issues no request, knows no status code:
// every visible string comes from the pure model, so no server-supplied text can
// reach the DOM through this component.

import {
  REFRESH_BUTTON_LABEL, REFRESH_PROVENANCE, canSubmitRefresh, refreshCopy, type InboxRefreshPresentation,
} from "@/lib/application/dashboard/inboxRefreshStateModel"
import styles from "./AdoptedWorkUnitDashboard.module.css"

// One discriminated presentation value, never a state plus a separately optional count:
// no prop combination here can ask for a fabricated number.
export function AdoptedInboxRefreshControl({ presentation, onRefresh }: {
  presentation: InboxRefreshPresentation
  onRefresh: () => void
}) {
  // ONE reading of the presentation, inside the model's fail-closed envelope. `state` is the
  // NORMALIZED state that produced this copy, so the button and the message can never
  // describe different presentations, and this component never touches `presentation` itself.
  const { state, copy, tone } = refreshCopy(presentation)
  const busy = state === "REFRESHING"

  return (
    <div className={styles.refreshRow}>
      {/* Rendered unconditionally, in all eleven states, before and after every attempt. */}
      <p className={styles.refreshProvenance}>{REFRESH_PROVENANCE}</p>
      <button
        type="button"
        className={styles.refreshBtn}
        onClick={onRefresh}
        disabled={!canSubmitRefresh(state)}
        aria-busy={busy}
      >
        {REFRESH_BUTTON_LABEL}
      </button>
      <p className={`${styles.refreshMessage} ${styles[`refreshMessage--${tone}`]}`}>{copy}</p>
    </div>
  )
}
