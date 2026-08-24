"use client"

import { useMemo } from "react"
import { loadC0LauncherValidationInput } from "@/lib/application/phase1/c0LauncherValidationInput"
import { CanonicalCandidateLauncherView } from "./CanonicalCandidateLauncherView"

export type WorkUnitLauncherMode = "palette" | "action-field"

// Default to the canonical C0 projection so the legacy mock adapter cannot become product authority.
export function WorkUnitLauncher() {
  const input = useMemo(() => loadC0LauncherValidationInput(), [])
  if (!input.ok) {
    return <section role="alert">Canonical candidate validation input is unavailable.</section>
  }
  return <CanonicalCandidateLauncherView items={input.items} />
}
