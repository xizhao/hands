/**
 * RSC Context
 *
 * React context for providing RSC configuration to the editor
 */

import { createContext, useContext, useState, useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'
import type { RscConfig, RscRenderResult, RscComponentRequest } from './types'
import {
  renderComponentViaRsc,
  renderBlockViaRsc,
  invalidateComponentCache,
  initFlightClient,
} from './client'

interface RscContextValue {
  /** RSC configuration */
  config: RscConfig
  /** Whether RSC is ready (Flight client loaded) */
  ready: boolean
  /** Initialize RSC (call once at startup) */
  init: () => Promise<boolean>
  /** Render a component via RSC */
  renderComponent: (request: RscComponentRequest) => Promise<RscRenderResult>
  /** Render a block via RSC */
  renderBlock: (blockId: string, props?: Record<string, unknown>) => Promise<RscRenderResult>
  /** Invalidate render cache */
  invalidate: (tagName?: string) => void
  /** Update RSC config */
  setConfig: (config: Partial<RscConfig>) => void
}

const RscContext = createContext<RscContextValue | null>(null)

export interface RscProviderProps {
  children: ReactNode
  /** Initial port (can be updated later) */
  port?: number
  /** Whether RSC is enabled */
  enabled?: boolean
}

/**
 * RSC Provider
 *
 * Provides RSC rendering capabilities to the editor.
 * Default port 55000 is the Runtime API which proxies to Vite worker.
 */
export function RscProvider({
  children,
  port = 55000,
  enabled = true,
}: RscProviderProps) {
  const [config, setConfigState] = useState<RscConfig>({
    port,
    enabled,
  })
  const [ready, setReady] = useState(false)

  const init = useCallback(async () => {
    if (!config.enabled) return false
    const success = await initFlightClient()
    setReady(success)
    return success
  }, [config.enabled])

  const renderComponent = useCallback(
    async (request: RscComponentRequest): Promise<RscRenderResult> => {
      if (!config.enabled) {
        return { element: null, error: 'RSC not enabled' }
      }
      if (!ready) {
        return { element: null, error: 'RSC not initialized' }
      }
      return renderComponentViaRsc(config.port, request)
    },
    [config.enabled, config.port, ready]
  )

  const renderBlock = useCallback(
    async (blockId: string, props?: Record<string, unknown>): Promise<RscRenderResult> => {
      if (!config.enabled) {
        return { element: null, error: 'RSC not enabled' }
      }
      if (!ready) {
        return { element: null, error: 'RSC not initialized' }
      }
      return renderBlockViaRsc(config.port, blockId, props)
    },
    [config.enabled, config.port, ready]
  )

  const invalidate = useCallback((tagName?: string) => {
    invalidateComponentCache(tagName)
  }, [])

  const setConfig = useCallback((updates: Partial<RscConfig>) => {
    setConfigState((prev) => ({ ...prev, ...updates }))
  }, [])

  const value = useMemo(
    () => ({
      config,
      ready,
      init,
      renderComponent,
      renderBlock,
      invalidate,
      setConfig,
    }),
    [config, ready, init, renderComponent, renderBlock, invalidate, setConfig]
  )

  return <RscContext.Provider value={value}>{children}</RscContext.Provider>
}

/**
 * Hook to access RSC context
 */
export function useRsc(): RscContextValue {
  const ctx = useContext(RscContext)
  if (!ctx) {
    throw new Error('useRsc must be used within an RscProvider')
  }
  return ctx
}

/**
 * Hook to check if RSC is available
 */
export function useRscAvailable(): boolean {
  const ctx = useContext(RscContext)
  return ctx?.ready ?? false
}
