"use client"

// Presentational only. Holds no state, issues no request, knows no status code:
// every visible string comes from the pure model, so no server-supplied text can
// reach the DOM through this component.

import {
  REFRESH_BUTTON_LABEL, REFRESH_PROVENANCE, canSubmitRefresh, refreshCopy, type InboxRefreshState,
} from "@/lib/application/dashboard/inboxRefreshStateModel"
import styles from "./AdoptedWorkUnitDashboard.module.css"

export function AdoptedInboxRefreshControl({ state, refreshed, onRefresh }: {
  state: InboxRefreshState
  refreshed?: number
  onRefresh: () => void
}) {
  const busy = state === "REFRESHING"
  const { copy, tone } = refreshCopy(state, refreshed)

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
