import { PanelResizeHandle as ResizeHandle } from 'react-resizable-panels'

interface Props {
  horizontal?: boolean
}

export function PanelResizeHandle({ horizontal }: Props) {
  return (
    <ResizeHandle
      className={`
        ${horizontal ? 'h-1' : 'w-1'}
        bg-gray-700 hover:bg-blue-500
        transition-colors duration-150
        flex items-center justify-center
      `}
    >
      <div
        className={`
          ${horizontal ? 'w-8 h-0.5' : 'h-8 w-0.5'}
          bg-gray-500 rounded-full
        `}
      />
    </ResizeHandle>
  )
}
