# last-lines

Read the last `N` lines from a file without loading the entire file into memory.

## Install

```bash
pnpm add last-lines
```

## Usage

```ts
import { lastLines, lastLinesSync } from 'last-lines'

const recent = await lastLines('app.log', 10)
const recentSync = lastLinesSync('app.log', 10)
```

Both APIs return `string[]`.

## API

```ts
interface LastLinesOptions {
  chunkSize?: number
  encoding?: BufferEncoding
}

declare function lastLines(
  path: PathLike,
  count: number,
  options?: LastLinesOptions,
): Promise<string[]>

declare function lastLinesSync(
  path: PathLike,
  count: number,
  options?: LastLinesOptions,
): string[]
```
