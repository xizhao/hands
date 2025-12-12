/**
 * BlockEditor - Plate-based block editor with RSC rendering
 *
 * Uses Plate for the editor structure (selection, drag/drop, editing).
 * Custom components portal in RSC-rendered content instead of placeholders.
 */

import { useState, useCallback, useEffect } from 'react'
import { PlateVisualEditor } from '../plate/PlateVisualEditor'
import { useRSCRender } from '../rsc/useRSCRender'
import { RscBlockContext } from '../rsc/context'

interface BlockEditorProps {
  blockId: string
  source: string
  runtimePort: number
  onSave: (source: string) => void
  readOnly?: boolean
}

export function BlockEditor({
  blockId,
  source,
  runtimePort,
  onSave,
  readOnly = false,
}: BlockEditorProps) {
  const [currentSource, setCurrentSource] = useState(source)

  // Fetch RSC render of the whole block
  const { rscElement, isLoading, error, refresh } = useRSCRender({
    port: runtimePort,
    blockId,
  })

  // Handle source changes from Plate editor
  const handleSourceChange = useCallback(
    (newSource: string) => {
      setCurrentSource(newSource)
      onSave(newSource)
      // Trigger RSC refresh after source change
      refresh()
    },
    [onSave, refresh]
  )

  // Sync source prop changes
  useEffect(() => {
    if (source !== currentSource) {
      setCurrentSource(source)
    }
  }, [source])

  return (
    <RscBlockContext.Provider value={{ rscElement, isLoading, blockId }}>
      <div className="h-full">
        <PlateVisualEditor
          source={currentSource}
          onSourceChange={handleSourceChange}
          className="min-h-full"
        />
      </div>
    </RscBlockContext.Provider>
  )
}
