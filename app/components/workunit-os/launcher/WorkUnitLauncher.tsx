"use client"

import { useEffect, useMemo, useState } from "react"
import { AtraWorkspace } from "@/components/atra/AtraWorkspace"
import { deriveAtraWorkspaceViewModel } from "@/lib/application/atra/deriveAtraWorkspaceViewModel"
import {
  LAUNCHER_LOADING_STATE,
  loadLauncherWorkUnits,
  type LauncherReadState,
} from "@/lib/application/launcher/launcherWorkUnitReadModel"
import {
  clampLauncherActiveIndex,
  filterLauncherWorkUnits,
  getActiveLauncherWorkUnit,
} from "@/lib/application/launcher/workUnitSelectionModel"
import {
  getLauncherKeyIntent,
  nextLauncherIndex,
  resolveLauncherEscapeAction,
} from "@/lib/application/launcher/keyboardNavigationModel"
import { CommandPaletteView } from "./CommandPaletteView"
import launcherStyles from "./WorkUnitLauncher.module.css"

// Retained for compatibility with the launcher mode contract. The Atra workspace
// shows the Node Canvas and Action Field together; the palette opens as an overlay.
export type WorkUnitLauncherMode = "palette" | "action-field"

export function WorkUnitLauncher() {
  // Real data source: GET /api/workunit/inbox through the canonical read model.
  // Every row passes the safe candidate projection before it reaches this state,
  // and a failed read resolves to `error` — never to mock WorkUnits.
  const [readState, setReadState] = useState<LauncherReadState>(LAUNCHER_LOADING_STATE)
  const workUnits = readState.workUnits

  const [selectedWorkUnitId, setSelectedWorkUnitId] = useState("")
  // Node selection is scoped to its WorkUnit; switching WorkUnit falls back to the
  // default focus stage without a reset effect.
  const [nodeSelection, setNodeSelection] = useState<{ readonly workUnitId: string; readonly nodeId: string } | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    let active = true
    loadLauncherWorkUnits().then((next) => {
      if (!active) return
      setReadState(next)
      setSelectedWorkUnitId((current) => (current === "" ? next.workUnits[0]?.id ?? "" : current))
    })
    return () => {
      active = false
    }
  }, [])

  const selectedWorkUnit = workUnits.find((unit) => unit.id === selectedWorkUnitId) ?? workUnits[0] ?? null
  const effectiveNodeId =
    nodeSelection && nodeSelection.workUnitId === selectedWorkUnitId ? nodeSelection.nodeId : null
  const workspace = useMemo(
    () => deriveAtraWorkspaceViewModel({ workUnit: selectedWorkUnit, selectedNodeId: effectiveNodeId }),
    [selectedWorkUnit, effectiveNodeId],
  )

  const filteredWorkUnits = useMemo(() => filterLauncherWorkUnits(workUnits, query), [workUnits, query])
  const clampedActiveIndex = clampLauncherActiveIndex(activeIndex, filteredWorkUnits.length)

  const handleSelectNode = (nodeId: string) => {
    if (selectedWorkUnitId) setNodeSelection({ workUnitId: selectedWorkUnitId, nodeId })
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const intent = getLauncherKeyIntent(event)
      if (intent === "open_palette") {
        event.preventDefault()
        setPaletteOpen(true)
        return
      }
      if (!paletteOpen) return
      if (intent === "close") {
        event.preventDefault()
        if (resolveLauncherEscapeAction(query) === "clear_query") {
          setQuery("")
          setActiveIndex(0)
          return
        }
        setPaletteOpen(false)
        return
      }
      if (intent === "confirm") {
        const active = getActiveLauncherWorkUnit(filteredWorkUnits, clampedActiveIndex)
        if (!active) return
        event.preventDefault()
        setSelectedWorkUnitId(active.id)
        setPaletteOpen(false)
        return
      }
      if (intent === "next") {
        event.preventDefault()
        setActiveIndex((current) => nextLauncherIndex(current, "next", filteredWorkUnits.length))
        return
      }
      if (intent === "previous") {
        event.preventDefault()
        setActiveIndex((current) => nextLauncherIndex(current, "previous", filteredWorkUnits.length))
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [paletteOpen, query, filteredWorkUnits, clampedActiveIndex])

  return (
    <>
      <AtraWorkspace
        workspace={workspace}
        onSelectNode={handleSelectNode}
        onOpenPalette={() => setPaletteOpen(true)}
      />
      <LauncherReadStatus state={readState} />
      {paletteOpen ? (
        <div className={launcherStyles.overlay}>
          <CommandPaletteView
            query={query}
            workUnits={filteredWorkUnits}
            selectedWorkUnitId={selectedWorkUnitId}
            activeIndex={clampedActiveIndex}
            onQueryChange={(next) => {
              setQuery(next)
              setActiveIndex(0)
            }}
            onActiveIndexChange={setActiveIndex}
            onSelectWorkUnit={setSelectedWorkUnitId}
            onOpenActionField={() => setPaletteOpen(false)}
            onClose={() => setPaletteOpen(false)}
          />
        </div>
      ) : null}
    </>
  )
}

/**
 * Async read status for the canonical Launcher.
 *
 * `loaded` renders nothing: the WorkUnit Graph and Action Field are the surface.
 * The other states are announced in a single safe, non-interactive strip — no
 * dashboard pane, no retry mutation, no fixture data.
 */
function LauncherReadStatus({ state }: { state: LauncherReadState }) {
  if (state.status === "loaded") return null
  const label = state.status === "loading" ? "Loading WorkUnits…" : state.message ?? ""
  return (
    <p
      className={`${launcherStyles.readStatus} ${launcherStyles[`readStatus--${state.status}`]}`}
      role="status"
      aria-live="polite"
      data-read-status={state.status}
    >
      {label}
    </p>
  )
}
