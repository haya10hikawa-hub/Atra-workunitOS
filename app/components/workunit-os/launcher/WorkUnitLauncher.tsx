"use client"

import { useEffect, useMemo, useState } from "react"
import { AtraWorkspace } from "@/components/atra/AtraWorkspace"
import { deriveAtraWorkspaceViewModel } from "@/lib/application/atra/deriveAtraWorkspaceViewModel"
import { candidateWorkUnitBridge } from "@/lib/application/candidate/candidateWorkUnitBridge"
import { candidatesToLauncherWorkUnits } from "@/lib/application/launcher/candidateToLauncherWorkUnit"
import {
  clampLauncherActiveIndex,
  filterLauncherWorkUnits,
  getActiveLauncherWorkUnit,
  type LauncherWorkUnit,
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
  // Candidate-only data source: SafeWorkUnitCandidate (mock_candidate_pipeline)
  // adapted into LauncherWorkUnit. Swapping to the live candidate bridge later
  // requires no UI change.
  const workUnits = useMemo<LauncherWorkUnit[]>(
    () => candidatesToLauncherWorkUnits(candidateWorkUnitBridge().workUnits),
    [],
  )
  const defaultWorkUnitId = useMemo(
    () => workUnits.find((unit) => /quarterly/i.test(unit.title))?.id ?? workUnits[0]?.id ?? "",
    [workUnits],
  )

  const [selectedWorkUnitId, setSelectedWorkUnitId] = useState(defaultWorkUnitId)
  // Node selection is scoped to its WorkUnit; switching WorkUnit falls back to the
  // default focus stage without a reset effect.
  const [nodeSelection, setNodeSelection] = useState<{ readonly workUnitId: string; readonly nodeId: string } | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [actionFieldOpen, setActionFieldOpen] = useState(true)
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)

  const selectedWorkUnit = workUnits.find((unit) => unit.id === selectedWorkUnitId) ?? workUnits[0] ?? null
  const effectiveNodeId =
    nodeSelection && nodeSelection.workUnitId === selectedWorkUnitId ? nodeSelection.nodeId : null
  const workspace = useMemo(
    () => deriveAtraWorkspaceViewModel({ workUnit: selectedWorkUnit, selectedNodeId: effectiveNodeId, actionFieldOpen }),
    [selectedWorkUnit, effectiveNodeId, actionFieldOpen],
  )

  const filteredWorkUnits = useMemo(() => filterLauncherWorkUnits(workUnits, query), [workUnits, query])
  const clampedActiveIndex = clampLauncherActiveIndex(activeIndex, filteredWorkUnits.length)

  const handleSelectNode = (nodeId: string) => {
    setActionFieldOpen(true)
    if (selectedWorkUnitId) setNodeSelection({ workUnitId: selectedWorkUnitId, nodeId })
  }

  const handleSelectWorkUnit = (workUnitId: string) => {
    setSelectedWorkUnitId(workUnitId)
    setActionFieldOpen(true)
  }

  const handleOpenActionField = () => {
    setActionFieldOpen(true)
    setPaletteOpen(false)
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
        handleSelectWorkUnit(active.id)
        handleOpenActionField()
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
        onCloseActionField={() => setActionFieldOpen(false)}
      />
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
            onSelectWorkUnit={handleSelectWorkUnit}
            onOpenActionField={handleOpenActionField}
            onClose={() => setPaletteOpen(false)}
          />
        </div>
      ) : null}
    </>
  )
}
