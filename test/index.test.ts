import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { lastLines, lastLinesSync, readLastLines, readLastLinesSync } from '../src/index'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
})

async function createTempFile(content: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'last-lines-'))
  const file = join(dir, 'fixture.txt')

  tempDirs.push(dir)
  await writeFile(file, content, 'utf8')

  return file
}

describe('lastLines', () => {
  it('reads the last lines asynchronously', async () => {
    const file = await createTempFile('alpha\nbeta\ngamma\ndelta')

    await expect(lastLines(file, 2)).resolves.toEqual(['gamma', 'delta'])
    await expect(readLastLines(file, 2)).resolves.toEqual(['gamma', 'delta'])
  })

  it('reads the last lines synchronously', async () => {
    const file = await createTempFile('alpha\r\nbeta\r\ngamma\r\n')

    expect(lastLinesSync(file, 2)).toEqual(['beta', 'gamma'])
    expect(readLastLinesSync(file, 2)).toEqual(['beta', 'gamma'])
  })

  it('supports small chunks and larger counts than the file contains', async () => {
    const file = await createTempFile(Array.from({ length: 12 }, (_, index) => `line-${index + 1}`).join('\n'))

    await expect(lastLines(file, 20, { chunkSize: 7 })).resolves.toEqual([
      'line-1',
      'line-2',
      'line-3',
      'line-4',
      'line-5',
      'line-6',
      'line-7',
      'line-8',
      'line-9',
      'line-10',
      'line-11',
      'line-12',
    ])
  })

  it('returns an empty array for empty files and zero lines', async () => {
    const emptyFile = await createTempFile('')
    const file = await createTempFile('one\ntwo')

    await expect(lastLines(emptyFile, 3)).resolves.toEqual([])
    await expect(lastLines(file, 0)).resolves.toEqual([])
    expect(lastLinesSync(emptyFile, 3)).toEqual([])
    expect(lastLinesSync(file, 0)).toEqual([])
  })

  it('validates numeric options', async () => {
    const file = await createTempFile('one\ntwo')

    await expect(lastLines(file, -1)).rejects.toThrow(RangeError)
    await expect(lastLines(file, 1, { chunkSize: 0 })).rejects.toThrow(RangeError)
    expect(() => lastLinesSync(file, -1)).toThrow(RangeError)
    expect(() => lastLinesSync(file, 1, { chunkSize: 0 })).toThrow(RangeError)
  })
})
