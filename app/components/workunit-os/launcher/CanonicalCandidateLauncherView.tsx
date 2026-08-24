"use client"

import { useState } from "react"
import type { CanonicalLauncherItem } from "@/lib/application/launcher/canonicalLauncherItem"
import styles from "./WorkUnitLauncher.module.css"

// Render only fields whose owner is CandidateProjection; unavailable source locators stay blocked.
export function CanonicalCandidateLauncherView({ items }: { readonly items: readonly CanonicalLauncherItem[] }) {
  const [selectedId, setSelectedId] = useState(items[0]?.candidateId ?? "")
  const selected = items.find((item) => item.candidateId === selectedId) ?? items[0] ?? null

  return (
    <section className={styles.palettePanel} aria-label="Canonical WorkUnit candidates">
      <div className={styles.paletteBody}>
        <div className={styles.resultColumn} role="listbox" aria-label="WorkUnit candidates">
          {items.map((item) => (
            <button key={item.candidateId} type="button" role="option"
              aria-selected={item.candidateId === selected?.candidateId}
              className={styles.resultRow} onClick={() => setSelectedId(item.candidateId)}>
              <span className={styles.resultMain}>
                <span className={styles.resultTitle}>{item.title}</span>
                <span className={styles.resultMeta}>{item.summary}</span>
              </span>
            </button>
          ))}
        </div>
        <aside className={styles.previewPane}>
          <h2 className={styles.previewTitle}>{selected?.title ?? "No canonical candidate"}</h2>
          <p className={styles.previewSummary}>{selected?.summary ?? "No candidate projection is available."}</p>
          <div className={styles.previewDivider} />
          <div className={styles.previewSummary}>
            <strong>Candidate evidence</strong>
            <p>Source records: {selected?.sourceIds.join(", ") || "None declared"}</p>
            <p>Missing information: {selected?.missingInformation.join(", ") || "None declared"}</p>
            <p>Human review required: {selected?.humanReviewRequired ? "Yes" : "No"}</p>
            <button type="button" disabled title="CandidateProjection has no authorized source locator">
              Open Source unavailable
            </button>
          </div>
        </aside>
      </div>
    </section>
  )
}
