export interface Block {
  id: string
  startLine: number
  endLine: number
  content: string
  type: 'heading' | 'paragraph' | 'code' | 'list'
}

export function parseBlocks(markdown: string): Block[] {
  const lines = markdown.split('\n')
  const blocks: Block[] = []
  let currentBlock: string[] = []
  let startLine = 0

  lines.forEach((line, idx) => {
    const isBlankLine = line.trim() === ''
    const isHeading = line.startsWith('#')

    if (isBlankLine && currentBlock.length > 0) {
      // End of block
      blocks.push({
        id: `block-${blocks.length}`,
        startLine,
        endLine: idx - 1,
        content: currentBlock.join('\n'),
        type: currentBlock[0].startsWith('#') ? 'heading' : 'paragraph',
      })
      currentBlock = []
    } else if (!isBlankLine) {
      if (currentBlock.length === 0) startLine = idx
      currentBlock.push(line)
    }
  })

  // Handle last block
  if (currentBlock.length > 0) {
    blocks.push({
      id: `block-${blocks.length}`,
      startLine,
      endLine: lines.length - 1,
      content: currentBlock.join('\n'),
      type: currentBlock[0].startsWith('#') ? 'heading' : 'paragraph',
    })
  }

  return blocks
}
