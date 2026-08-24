"use client"

import type { LauncherWorkUnit } from "@/lib/application/launcher/workUnitSelectionModel"
import { FiArrowRight, FiBox, FiClock, FiSearch } from "react-icons/fi"
import { SourceAppIcon } from "./SourceAppIcon"
import styles from "./WorkUnitLauncher.module.css"

type Props = {
  readonly query: string
  readonly workUnits: readonly LauncherWorkUnit[]
  readonly selectedWorkUnitId: string | null
  readonly activeIndex: number
  readonly onQueryChange: (query: string) => void
  readonly onActiveIndexChange: (index: number) => void
  readonly onSelectWorkUnit: (id: string) => void
  readonly onOpenActionField: () => void
  readonly onClose: () => void
}

function resultCountLabel(count: number): string {
  return `${count} ${count === 1 ? "result" : "results"}`
}

export function CommandPaletteView(props: Props) {
  const activeWorkUnit = props.workUnits[props.activeIndex] ?? null
  const hasQuery = props.query.trim().length > 0
  const isEmpty = props.workUnits.length === 0

  return (
    <section className={styles.palettePanel} role="dialog" aria-label="WorkUnit command palette">
      <div className={styles.paletteTop}>
        <FiSearch className={styles.searchGlyph} aria-hidden="true" />
        <input
          className={styles.searchInput}
          value={props.query}
          onChange={(event) => props.onQueryChange(event.target.value)}
          placeholder="Search WorkUnits"
          autoFocus
        />
        <kbd>⌘ K</kbd>
      </div>
      <div className={styles.paletteBody}>
        <div className={styles.resultColumn}>
          <div className={styles.resultList} role="listbox" aria-label="WorkUnit results">
            {props.workUnits.map((workUnit, index) => (
              <button
                key={workUnit.id}
                type="button"
                role="option"
                aria-selected={index === props.activeIndex}
                className={`${styles.resultRow} ${index === props.activeIndex ? styles.resultRowActive : ""}`}
                data-selected={props.selectedWorkUnitId === workUnit.id ? "true" : "false"}
                onMouseEnter={() => props.onActiveIndexChange(index)}
                onClick={() => {
                  props.onActiveIndexChange(index)
                  props.onSelectWorkUnit(workUnit.id)
                }}
                onDoubleClick={props.onOpenActionField}
              >
                <SourceAppIcon icon={workUnit.sourceIcon} size="lg" />
                <span className={styles.resultMain}>
                  <span className={styles.resultTitle}>{workUnit.title}</span>
                  <span className={styles.resultMeta}>{workUnit.summary}</span>
                </span>
                <span className={styles.resultRoi}>ROI {workUnit.roi.toFixed(1)}</span>
                <span className={`${styles.statusBadge} ${styles[`status-${workUnit.statusTone ?? "gray"}`]}`}>
                  {workUnit.status}
                </span>
              </button>
            ))}
            {isEmpty ? (
              <div className={styles.emptyState}>
                <FiSearch className={styles.emptyStateGlyph} aria-hidden="true" />
                <p className={styles.emptyStateTitle}>
                  {hasQuery ? `No WorkUnits match "${props.query.trim()}"` : "No WorkUnits available"}
                </p>
                <p className={styles.emptyStateHint}>
                  {hasQuery ? "Try a different title, source, status, or owner." : "New inbox signals will appear here."}
                </p>
              </div>
            ) : null}
          </div>
          <div className={styles.resultSummaryRow}>
            <button type="button">Show more results...⌄</button>
            <span>{resultCountLabel(props.workUnits.length)}</span>
          </div>
        </div>
        <aside className={styles.previewPane}>
          <div className={styles.previewHeading}>
            <SourceAppIcon icon={activeWorkUnit?.sourceIcon ?? {
              id: "unknown",
              label: "Unknown source",
              assetPath: null,
              fallbackBadge: "WU",
              sourceType: "fallback_badge",
            }} size="lg" />
            <h2 className={styles.previewTitle}>{activeWorkUnit?.title ?? "No selection"}</h2>
            {activeWorkUnit ? (
              <span className={`${styles.statusBadge} ${styles[`status-${activeWorkUnit.statusTone ?? "gray"}`]}`}>
                {activeWorkUnit.status}
              </span>
            ) : null}
          </div>
          <p className={styles.previewSummary}>{activeWorkUnit?.objective ?? "Select a WorkUnit to inspect the compact preview."}</p>
          <div className={styles.previewDivider} />
          <div className={styles.previewSummary}>
            <strong>Candidate evidence</strong>
            <p>{activeWorkUnit?.candidateProjection?.summary ?? "No projection available."}</p>
            <p>Source records: {activeWorkUnit?.candidateProjection?.sourceIds.join(", ") || "None declared"}</p>
            <p>Context: no context records declared</p>
            <p>Missing information: {activeWorkUnit?.candidateProjection?.missingInformation.join(", ") || "None declared"}</p>
            <p>Human review required: {activeWorkUnit?.candidateProjection?.humanReviewRequired ? "Yes" : "No"}</p>
          </div>
          <dl className={styles.previewFacts}>
            <div>
              <dt><FiBox className={styles.factIcon} aria-hidden="true" />Source</dt>
              <dd>{activeWorkUnit?.sourceDetail ?? "—"}</dd>
            </div>
            <div>
              <dt><FiClock className={styles.factIcon} aria-hidden="true" />Urgency</dt>
              <dd>{activeWorkUnit?.urgency ?? "—"}</dd>
            </div>
            <div>
              <dt><FiArrowRight className={styles.factIcon} aria-hidden="true" />Next Step</dt>
              <dd>{activeWorkUnit?.nextStep ?? "—"}</dd>
            </div>
          </dl>
        </aside>
      </div>
      <footer className={styles.footerRow}>
        <div className={styles.footerGroup}>
          <span><kbd>↵</kbd> Enter = Open Detail</span>
          <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
        </div>
        <div className={styles.footerGroup}>
          <span><kbd>⌘ K</kbd> Open Command Palette</span>
          <span><kbd>Esc</kbd> {hasQuery ? "Clear search" : "Close"}</span>
        </div>
      </footer>
    </section>
  )
}
