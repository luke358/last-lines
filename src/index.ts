import type { PathLike } from 'node:fs'
import { Buffer } from 'node:buffer'
import { closeSync, fstatSync, openSync, readSync } from 'node:fs'
import { open } from 'node:fs/promises'

const DEFAULT_CHUNK_SIZE = 64 * 1024

export interface LastLinesOptions {
  chunkSize?: number
  encoding?: BufferEncoding
}

export async function lastLines(path: PathLike, count: number, options: LastLinesOptions = {}): Promise<string[]> {
  assertCount(count)

  if (count === 0) {
    return []
  }

  const { chunkSize, encoding } = normalizeOptions(options)
  const file = await open(path, 'r')

  try {
    const { size } = await file.stat()

    if (size === 0) {
      return []
    }

    const state = await collectTailChunks({
      chunkSize,
      count,
      read: async (length, position) => {
        const buffer = Buffer.allocUnsafe(length)
        const { bytesRead } = await file.read(buffer, 0, length, position)
        return buffer.subarray(0, bytesRead)
      },
      size,
    })

    return finalizeLines({
      chunks: state.chunks,
      count,
      encoding,
      hasBoundary: state.position === 0
        || isNewlineByte(state.chunks[0]?.[0])
        || isNewlineByte((await file.read(Buffer.alloc(1), 0, 1, state.position - 1)).buffer[0]),
    })
  }
  finally {
    await file.close()
  }
}

export function lastLinesSync(path: PathLike, count: number, options: LastLinesOptions = {}): string[] {
  assertCount(count)

  if (count === 0) {
    return []
  }

  const { chunkSize, encoding } = normalizeOptions(options)
  const fd = openSync(path, 'r')

  try {
    const { size } = fstatSync(fd)

    if (size === 0) {
      return []
    }

    const state = collectTailChunksSync({
      chunkSize,
      count,
      read: (length, position) => {
        const buffer = Buffer.allocUnsafe(length)
        const bytesRead = readSync(fd, buffer, 0, length, position)
        return buffer.subarray(0, bytesRead)
      },
      size,
    })

    const boundaryBuffer = Buffer.alloc(1)
    const hasPreviousNewline = state.position > 0
      && readSync(fd, boundaryBuffer, 0, 1, state.position - 1) === 1
      && isNewlineByte(boundaryBuffer[0])

    return finalizeLines({
      chunks: state.chunks,
      count,
      encoding,
      hasBoundary: state.position === 0 || isNewlineByte(state.chunks[0]?.[0]) || hasPreviousNewline,
    })
  }
  finally {
    closeSync(fd)
  }
}

export const readLastLines = lastLines
export const readLastLinesSync = lastLinesSync

function normalizeOptions(options: LastLinesOptions): Required<LastLinesOptions> {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE

  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new RangeError('`chunkSize` must be a positive integer.')
  }

  return {
    chunkSize,
    encoding: options.encoding ?? 'utf8',
  }
}

function assertCount(count: number): void {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError('`count` must be a non-negative integer.')
  }
}

async function collectTailChunks(context: {
  chunkSize: number
  count: number
  read: (length: number, position: number) => Promise<Buffer>
  size: number
}): Promise<{ chunks: Buffer[], position: number }> {
  const chunks: Buffer[] = []
  let position = context.size
  let newlineCount = 0

  while (position > 0 && newlineCount <= context.count) {
    const length = Math.min(context.chunkSize, position)
    position -= length

    const buffer = await context.read(length, position)
    chunks.unshift(buffer)
    newlineCount += countNewlines(buffer)
  }

  return {
    chunks,
    position,
  }
}

function collectTailChunksSync(context: {
  chunkSize: number
  count: number
  read: (length: number, position: number) => Buffer
  size: number
}): { chunks: Buffer[], position: number } {
  const chunks: Buffer[] = []
  let position = context.size
  let newlineCount = 0

  while (position > 0 && newlineCount <= context.count) {
    const length = Math.min(context.chunkSize, position)
    position -= length

    const buffer = context.read(length, position)
    chunks.unshift(buffer)
    newlineCount += countNewlines(buffer)
  }

  return {
    chunks,
    position,
  }
}

function finalizeLines(context: {
  chunks: Buffer[]
  count: number
  encoding: BufferEncoding
  hasBoundary: boolean
}): string[] {
  const lines = splitLines(Buffer.concat(context.chunks).toString(context.encoding))

  if (!context.hasBoundary) {
    lines.shift()
  }

  return lines.slice(-context.count)
}

function splitLines(text: string): string[] {
  const lines = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n')

  if (lines.at(-1) === '') {
    lines.pop()
  }

  return lines
}

function countNewlines(buffer: Buffer): number {
  let total = 0

  for (const byte of buffer) {
    if (byte === 0x0A) {
      total += 1
    }
  }

  return total
}

function isNewlineByte(byte: number | undefined): boolean {
  return byte === 0x0A || byte === 0x0D
}
