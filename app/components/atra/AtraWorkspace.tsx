"use client"

import type { AtraWorkspaceViewModel } from "@/lib/application/atra/deriveAtraWorkspaceViewModel"
import type {
  AtraDraftBlock,
  AtraProcessNode,
  AtraSourceBadge,
} from "@/lib/application/atra/atraWorkspaceModel"
import styles from "./Atra.module.css"

// Fixed logical graph-stage coordinate system (px). Every graph element — core
// card, process nodes, output node and the edge SVG — is positioned in this same
// space, so the composition is identical across viewport sizes. The stage is
// centered (slightly left-biased) inside the canvas; only the surrounding margin
// changes with the viewport, never the internal geometry.
const STAGE_W = 720
const STAGE_H = 700
const NODE_X = 360
const NODE_W = 150
const NODE_H = 60
const NODE_TOP = [16, 116, 216, 316, 416, 516, 616]
const CORE = { x: 16, top: 235, width: 240, rightX: 256, centerY: 290 }
const OUTPUT_X = 544

const nodeCenterY = (index: number): number => NODE_TOP[index]! + NODE_H / 2

type AtraWorkspaceProps = {
  readonly workspace: AtraWorkspaceViewModel
  readonly onSelectNode: (id: string) => void
  readonly onOpenPalette: () => void
  readonly onCloseActionField: () => void
}

export function AtraWorkspace({ workspace, onSelectNode, onOpenPalette, onCloseActionField }: AtraWorkspaceProps) {
  const composeIndex = workspace.processNodes.findIndex((node) => node.output)
  const composeNode = composeIndex >= 0 ? workspace.processNodes[composeIndex]! : null

  return (
    <div className={styles.root}>
      <header className={styles.topbar}>
        <div className={styles.topLeft}>
          <button type="button" className={styles.iconBtn} aria-label="Menu unavailable in this preview" title="Unavailable in this preview" disabled>{MenuIcon}</button>
          <span className={styles.logo}>Atra</span>
          <nav className={styles.breadcrumb} aria-label="Workspace breadcrumb">
            <span>Workspace</span>
            <i aria-hidden="true">›</i>
            <span className={styles.breadcrumbCurrent}>{workspace.workspaceTitle}</span>
          </nav>
        </div>
        <button type="button" className={styles.palette} onClick={onOpenPalette} aria-label="Command Palette" aria-keyshortcuts="Meta+K">
          <span className={styles.paletteIcon} aria-hidden="true">{SearchIcon}</span>
          <span className={styles.palettePlaceholder}>Command Palette</span>
          <kbd className={styles.paletteKbd}>⌘ K</kbd>
        </button>
        <div className={styles.topRight}>
          <button type="button" className={styles.iconBtn} aria-label="Settings unavailable in this preview" title="Unavailable in this preview" disabled>{GearIcon}</button>
          <button type="button" className={styles.iconBtn} aria-label="Help unavailable in this preview" title="Unavailable in this preview" disabled>{HelpIcon}</button>
          <button type="button" className={styles.iconBtn} aria-label="Notifications unavailable in this preview" title="Unavailable in this preview" disabled>{BellIcon}</button>
        </div>
      </header>

      <div className={`${styles.body} ${workspace.actionField.visible ? "" : styles.bodyActionFieldClosed}`}>
        <aside className={styles.rail} aria-label="Workspace tools">
          <button type="button" className={`${styles.railBtn} ${styles.railBtnActive}`} aria-label="Focus unavailable in this preview" title="Unavailable in this preview" disabled>{FocusIcon}</button>
          <button type="button" className={styles.railBtn} aria-label="Fit view unavailable in this preview" title="Unavailable in this preview" disabled>{FitIcon}</button>
          <button type="button" className={styles.railBtn} aria-label="Groups unavailable in this preview" title="Unavailable in this preview" disabled>{GridIcon}</button>
          <button type="button" className={styles.railBtn} aria-label="Filter unavailable in this preview" title="Unavailable in this preview" disabled>{FilterIcon}</button>
        </aside>

        <main className={styles.canvas} aria-label="Node Canvas">
          <div className={styles.graphStage} style={{ width: STAGE_W, height: STAGE_H }}>
            <svg className={styles.edges} viewBox={`0 0 ${STAGE_W} ${STAGE_H}`} aria-hidden="true">
              {workspace.processNodes.map((processNode, index) => (
                <path
                  key={processNode.id}
                  className={processNode.state === "selected" ? styles.edgeActive : styles.edge}
                  d={edgePath(CORE.rightX, CORE.centerY, NODE_X, nodeCenterY(index))}
                  fill="none"
                />
              ))}
              {composeNode?.output ? (
                <line
                  className={styles.edgeActive}
                  x1={NODE_X + NODE_W}
                  y1={nodeCenterY(composeIndex)}
                  x2={OUTPUT_X}
                  y2={nodeCenterY(composeIndex)}
                />
              ) : null}
            </svg>

            <article
              className={styles.coreCard}
              style={{ left: CORE.x, top: CORE.top, width: CORE.width }}
              aria-label="Core objective"
            >
              <header className={styles.coreHeader}>
                <span className={styles.coreLabel}>CORE OBJECTIVE</span>
                <span className={styles.coreScore}>{workspace.coreObjective.score}</span>
              </header>
              <strong className={styles.coreTitle}>{workspace.coreObjective.label}</strong>
              <span className={styles.corePort} aria-hidden="true" />
            </article>

            {workspace.processNodes.map((processNode, index) => (
              <ProcessNodeCard
                key={processNode.id}
                node={processNode}
                top={NODE_TOP[index]!}
                onSelect={() => onSelectNode(processNode.id)}
              />
            ))}

            {composeNode?.output ? (
              <button
                type="button"
                className={styles.outputNode}
                style={{ left: OUTPUT_X, top: nodeCenterY(composeIndex) - 22 }}
                aria-pressed={workspace.selectedNodeId === composeNode.output.id}
                onClick={() => onSelectNode(composeNode.output!.id)}
              >
                {composeNode.output.label}
              </button>
            ) : null}
          </div>
        </main>

        {workspace.actionField.visible ? (
        <section className={styles.actionField} aria-label="Action Field">
          <header className={styles.afHeader}>
            <span className={styles.afTitle}>
              Action Field: <span className={styles.afPath}>{workspace.actionField.path}</span>
            </span>
            <button type="button" className={styles.iconBtn} aria-label="Close Action Field" onClick={onCloseActionField}>{CloseIcon}</button>
          </header>

          <article className={styles.afCard}>
            <div className={styles.afOutputRow}>
              <span className={styles.afOutputLabel}>Output: {workspace.actionField.outputTitle}</span>
            </div>
            <div className={styles.afLinked}>
              <span>Linked Context:</span>
              {workspace.actionField.linkedContext.length > 0 ? (
                <span className={styles.afLinkedItems}>{workspace.actionField.linkedContext.join(", ")}</span>
              ) : null}
            </div>
          </article>

          <article className={styles.afCard}>
            <div className={styles.afDraftHead}>
              <span className={styles.afDraftLabel}>
                Candidate preview — read-only <span className={styles.afDraftFile}>{workspace.actionField.draftFilename}</span>
              </span>
              <span className={styles.afBadge}>Read-only</span>
            </div>
            <div className={styles.afDraftBody}>
              {workspace.actionField.draftBlocks.map((block, index) => (
                <DraftBlockView key={index} block={block} />
              ))}
            </div>
          </article>
        </section>
        ) : null}
      </div>

      <footer className={styles.statusbar}>
        <span className={styles.statusVersion}>Atra {workspace.appVersion}</span>
        <div className={styles.statusRight}>
          <span className={styles.statusItem}>{ShieldIcon} Safety Protocol</span>
          <span className={styles.statusItem}>Finalization Queue</span>
          <span className={styles.statusItem}>{LogIcon} System Logs</span>
        </div>
      </footer>
    </div>
  )
}

function ProcessNodeCard(props: {
  readonly node: AtraProcessNode
  readonly top: number
  readonly onSelect: () => void
}) {
  const { node, top } = props
  const selected = node.state === "selected"
  return (
    <button
      type="button"
      className={[
        styles.node,
        selected ? styles.nodeSelected : "",
        node.state === "muted" ? styles.nodeMuted : "",
      ].filter(Boolean).join(" ")}
      style={{ top: `${top}px` }}
      aria-pressed={selected}
      onClick={props.onSelect}
    >
      <span className={styles.nodePort} aria-hidden="true" />
      {node.output ? <span className={styles.nodeWu} aria-hidden="true">WU</span> : null}
      <span className={styles.nodeLabel}>{node.label || " "}</span>
      {node.badges.length > 0 ? (
        <span className={styles.nodeBadges}>
          {node.badges.map((badge) => (
            <SourceBadge key={badge.code} badge={badge} />
          ))}
        </span>
      ) : null}
      {node.output ? <span className={styles.nodePortOut} aria-hidden="true" /> : null}
    </button>
  )
}

function SourceBadge({ badge }: { readonly badge: AtraSourceBadge }) {
  return (
    <span className={styles.badge}>
      <i className={styles.badgeDot} data-tone={badge.tone} aria-hidden="true" />
      {badge.code}
    </span>
  )
}

function DraftBlockView({ block }: { readonly block: AtraDraftBlock }) {
  if (block.kind === "h1") return <h1 className={styles.draftH1}>{block.text}</h1>
  if (block.kind === "note") return <p className={styles.draftNote}>{block.text}</p>
  if (block.kind === "bullet") {
    return (
      <p className={styles.draftBullet}>
        <span aria-hidden="true">- </span>
        <DraftSpans block={block} />
      </p>
    )
  }
  return (
    <p className={styles.draftP}>
      <DraftSpans block={block} />
    </p>
  )
}

function DraftSpans({ block }: { readonly block: Extract<AtraDraftBlock, { kind: "p" | "bullet" }> }) {
  return (
    <>
      {block.spans.map((span, index) =>
        span.tone ? (
          <span key={index} className={styles.srcToken} data-tone={span.tone}>{span.text}</span>
        ) : (
          <span key={index}>{span.text}</span>
        ),
      )}
    </>
  )
}

function edgePath(x1: number, y1: number, x2: number, y2: number): string {
  const midX = (x1 + x2) / 2
  return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`
}

// ─── Inline icons (no external icon package) ───────────────────────
const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
}
const MenuIcon = <svg viewBox="0 0 24 24" width="16" height="16" {...stroke}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
const SearchIcon = <svg viewBox="0 0 24 24" width="14" height="14" {...stroke}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>
const GearIcon = <svg viewBox="0 0 24 24" width="16" height="16" {...stroke}><circle cx="12" cy="12" r="3" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" /></svg>
const HelpIcon = <svg viewBox="0 0 24 24" width="16" height="16" {...stroke}><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7M12 17h.01" /></svg>
const BellIcon = <svg viewBox="0 0 24 24" width="16" height="16" {...stroke}><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 20a2 2 0 0 0 4 0" /></svg>
const CloseIcon = <svg viewBox="0 0 24 24" width="16" height="16" {...stroke}><path d="M6 6l12 12M18 6 6 18" /></svg>
const FocusIcon = <svg viewBox="0 0 24 24" width="18" height="18" {...stroke}><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /></svg>
const FitIcon = <svg viewBox="0 0 24 24" width="18" height="18" {...stroke}><path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4" /></svg>
const GridIcon = <svg viewBox="0 0 24 24" width="18" height="18" {...stroke}><rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="4" width="7" height="7" rx="1" /><rect x="4" y="13" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" /></svg>
const FilterIcon = <svg viewBox="0 0 24 24" width="18" height="18" {...stroke}><path d="M4 5h16l-6 7v6l-4 2v-8z" /></svg>
const ShieldIcon = <svg viewBox="0 0 24 24" width="13" height="13" {...stroke}><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" /></svg>
const LogIcon = <svg viewBox="0 0 24 24" width="13" height="13" {...stroke}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 9h8M8 13h8M8 17h5" /></svg>
