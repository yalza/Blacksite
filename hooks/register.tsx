import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Mission, MissionStatus, ToolRow, Usage } from '../types'

const PANE = 'blacksite'

// Hắc kim: black lacquer, gold and champagne; red is kept for blocked actions only
const C = {
  bg: '#0f0e0c',
  panel: '#171511',
  line: '#3a3226',
  gold: '#e8b04a',
  champagne: '#f3e6c8',
  ash: '#978d7e',
  red: '#ff3b4e',
  ok: '#9bd49f',
} as const

// Change a tag when that value's fields change: it declines what an earlier version stored
const missions = atom({ plugin: 'blacksite', key: 'missions' } as const, [] as Mission[], {
  shape: 'missions-1',
})
const tools = atom({ plugin: 'blacksite', key: 'tools' } as const, [] as ToolRow[], {
  shape: 'tools-1',
})
const blocked = atom({ plugin: 'blacksite', key: 'blocked' } as const, 0)
const usage = atom({ plugin: 'blacksite', key: 'usage' } as const, {} as Usage)
const armed = atom({ plugin: 'blacksite', key: 'armed' } as const, false)

const SEED: Mission[] = [
  { id: 'm-mac', text: 'Bán Mac mini M2 16/256', status: 'run' },
  { id: 'm-web', text: 'Landing page mẫu cho cửa hàng', status: 'wait' },
  { id: 'm-unity', text: 'Bài tìm học viên gia sư Unity', status: 'wait' },
]

const STATUS: Record<MissionStatus, { label: string; color: string }> = {
  run: { label: 'ĐANG CHẠY', color: C.gold },
  wait: { label: 'CHỜ', color: C.ash },
  done: { label: 'XONG', color: C.ok },
}
const NEXT_STATUS: Record<MissionStatus, MissionStatus> = { wait: 'run', run: 'done', done: 'wait' }

const ROW: Record<ToolRow['status'], { label: string; color: string }> = {
  run: { label: 'CHẠY', color: C.gold },
  ok: { label: 'XONG', color: C.ok },
  err: { label: 'LỖI ', color: C.red },
  deny: { label: 'CHẶN', color: C.red },
}

// --- Shield: Bash commands refused before they run ---------------------------

const SEGMENT = /&&|\|\||;|\||\n/

function isForcedRecursiveRm(segment: string): boolean {
  const words = segment.trim().split(/\s+/)
  const at = words.findIndex(w => w === 'rm' || w.endsWith('/rm'))
  if (at < 0) return false
  let isRecursive = false
  let isForced = false
  for (const w of words.slice(at + 1)) {
    if (w === '--recursive') isRecursive = true
    else if (w === '--force') isForced = true
    else if (/^-[a-zA-Z]+$/.test(w)) {
      if (/[rR]/.test(w)) isRecursive = true
      if (w.includes('f')) isForced = true
    }
  }
  return isRecursive && isForced
}

const ALWAYS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bgit\b.*\bpush\b.*(\s--force(?![\w-])|\s-f\b)/, 'git push --force'],
  [/\bmkfs(\.\w+)?\b/, 'định dạng ổ đĩa (mkfs)'],
  [/\bdd\b.*\bof=\/dev\//, 'ghi đè thiết bị (dd)'],
]
const WHEN_ARMED: ReadonlyArray<readonly [RegExp, string]> = [
  [/(^|\s|\/)rm\s/, 'xóa file khi đang báo động'],
  [/\bgit\b.*\breset\b.*--hard\b/, 'git reset --hard'],
  [/\bgit\b.*\bclean\b.*\s-[a-zA-Z]*f/, 'git clean -f'],
]

// PowerShell and cmd on Windows: case-insensitive, flags may be shortened (-r, -fo)
const WINDOWS_DELETE = /(^|[\s;(])(remove-item|ri|rm|del|erase|rd|rmdir)(?![\w-])/i
const PS_RECURSE = /\s-r(e(c(u(r(s(e)?)?)?)?)?)?(?![\w-])/i
const PS_FORCE = /\s-fo(r(c(e)?)?)?(?![\w-])/i
const WINDOWS_ALWAYS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(rd|rmdir|del|erase)\b.*\/s\b.*\/q\b|\b(rd|rmdir|del|erase)\b.*\/q\b.*\/s\b/i, 'xóa thư mục không hỏi (/s /q)'],
  [/\b(format-volume|clear-disk|initialize-disk)\b/i, 'định dạng ổ đĩa'],
  [/\bformat(\.com)?\s+[a-z]:/i, 'định dạng ổ đĩa (format)'],
]

function isForcedRecursiveRemoveItem(segment: string): boolean {
  return WINDOWS_DELETE.test(segment) && PS_RECURSE.test(segment) && PS_FORCE.test(segment)
}

/** Why the shield refuses this Bash or PowerShell command, or undefined to let it run. */
function judge(command: string, isArmed: boolean): string | undefined {
  for (const segment of command.split(SEGMENT)) {
    if (isForcedRecursiveRm(segment)) return 'rm -rf'
    if (isForcedRecursiveRemoveItem(segment)) return 'Remove-Item -Recurse -Force'
    for (const [pattern, reason] of [...ALWAYS, ...WINDOWS_ALWAYS]) if (pattern.test(segment)) return reason
    if (!isArmed) continue
    for (const [pattern, reason] of WHEN_ARMED) if (pattern.test(segment)) return reason
    if (WINDOWS_DELETE.test(segment)) return 'xóa file khi đang báo động'
  }
  return undefined
}

const SHELLS = new Set(['Bash', 'PowerShell'])

/** The command a shell tool is about to run, or '' for any other tool. */
function shellCommand(tool: string, input: Record<string, unknown>): string {
  const command = input.command
  return SHELLS.has(tool) && typeof command === 'string' ? command : ''
}

const denial = (reason: string) =>
  `Blacksite: lá chắn đã chặn lệnh này (${reason}). Đừng tìm cách chạy lại bằng lệnh khác; nếu thật sự cần, hãy hỏi người dùng tự chạy.`

// --- Helpers -------------------------------------------------------------------

const shortTool = (tool: string) => (tool.startsWith('mcp__') ? (tool.split('__').pop() ?? tool) : tool)

function targetOf(input: Record<string, unknown>): string {
  const pick = (key: string) => {
    const v = input[key]
    return typeof v === 'string' ? v : ''
  }
  const path = pick('file_path') || pick('notebook_path') || pick('path')
  if (path) return path.split('/').pop() || path
  const url = pick('url')
  if (url) {
    try {
      return new URL(url).host
    } catch {
      return url
    }
  }
  return (pick('command') || pick('query') || pick('pattern') || pick('description')).replace(/\s+/g, ' ')
}

const pad = (n: number) => String(n).padStart(2, '0')
function clockText(ms: number): string {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function meter(percent: number | undefined, width: number): string {
  if (percent === undefined) return '—'
  const full = Math.round((Math.max(0, Math.min(100, percent)) / 100) * width)
  return '▰'.repeat(full) + '▱'.repeat(width - full)
}

const isWindows = ($: EngineInterface) => /^[A-Za-z]:[\\/]/.test($.plugin.root)

// $.audio.play has no player on Windows, so the clip goes through PowerShell's SoundPlayer there
function chime($: EngineInterface, clip: 'alarm' | 'done') {
  if (!isWindows($)) {
    $.audio.play({ asset: `sounds/${clip}.wav` }).catch(() => undefined)
    return
  }
  const file = `${$.plugin.root}/sounds/${clip}.wav`.replace(/\//g, '\\').replace(/'/g, "''")
  $.process
    .run(['powershell', '-NoProfile', '-NonInteractive', '-Command', `(New-Object Media.SoundPlayer '${file}').PlaySync()`], {
      timeoutMs: 10_000,
    })
    .catch(() => undefined)
}

async function refreshStatus($: EngineInterface) {
  const [count, use, isArmed] = await Promise.all([read($, blocked), read($, usage), read($, armed)])
  const parts = ['◆ BLACKSITE', isArmed ? '◉ BÁO ĐỘNG' : '⛨ LÁ CHẮN BẬT', `ĐÃ CHẶN ${count}`]
  if (use.ctx !== undefined) parts.push(`BỘ NHỚ ${use.ctx}%`)
  $.ui.status(parts.join('  ▸  '))
}

const openPane = ($: EngineInterface) => $.ui.open({ id: PANE, title: 'Blacksite', backgroundColor: C.bg })

async function toggleArm($: EngineInterface): Promise<boolean> {
  const isArmed = await update($, armed, v => !v)
  $.ui.toast(isArmed ? '◉ Chế độ báo động: BẬT' : 'Chế độ báo động: TẮT')
  if (isArmed) chime($, 'alarm')
  await refreshStatus($)
  return isArmed
}

// --- Missions ------------------------------------------------------------------

function isMission(v: unknown): v is Mission {
  if (typeof v !== 'object' || v === null) return false
  const m = v as Record<string, unknown>
  return (
    typeof m.id === 'string' &&
    typeof m.text === 'string' &&
    (m.status === 'run' || m.status === 'wait' || m.status === 'done')
  )
}

async function loadMissions($: EngineInterface) {
  const saved = await $.store.get('missions')
  const list = Array.isArray(saved) ? saved.filter(isMission) : SEED
  await update($, missions, () => list)
}

async function changeMissions($: EngineInterface, change: (list: Mission[]) => Mission[]) {
  const list = await update($, missions, change)
  await $.store.set('missions', list)
  return list
}

/** Sets one mission's status; only one mission runs at a time. */
function withStatus(list: Mission[], id: string, status: MissionStatus): Mission[] {
  return list.map(m => {
    if (m.id === id) return { ...m, status }
    if (status === 'run' && m.status === 'run') return { ...m, status: 'wait' as const }
    return m
  })
}

const VERBS: Record<string, 'add' | 'run' | 'done' | 'remove' | 'clear'> = {
  them: 'add', thêm: 'add', add: 'add',
  chay: 'run', chạy: 'run', run: 'run',
  xong: 'done', done: 'done',
  xoa: 'remove', xóa: 'remove', xoá: 'remove',
  don: 'clear', dọn: 'clear', clear: 'clear',
}
const USAGE = 'Dùng: /nhiemvu thêm <việc> | chạy <số> | xong <số> | xóa <số> | dọn'

function listText(list: Mission[]): string {
  if (list.length === 0) return 'Chưa có nhiệm vụ nào. Thêm bằng: /nhiemvu thêm <việc>'
  return list.map((m, i) => `${i + 1}. [${STATUS[m.status].label}] ${m.text}`).join('\n')
}

async function missionCommand($: EngineInterface, args: string): Promise<string> {
  const trimmed = args.trim()
  if (!trimmed) return listText(await read($, missions))
  const [first = '', ...rest] = trimmed.split(/\s+/)
  const verb = VERBS[first.toLowerCase()]
  const tail = rest.join(' ')
  if (verb === undefined) return `Không hiểu "${first}". ${USAGE}`

  if (verb === 'add') {
    if (!tail) return 'Thiếu nội dung. Ví dụ: /nhiemvu thêm Viết bài tìm học viên'
    const id = `m-${(await $.clock.now()).toString(36)}`
    const list = await changeMissions($, l => [
      ...l,
      { id, text: tail, status: l.some(m => m.status === 'run') ? 'wait' : 'run' },
    ])
    return `Đã thêm.\n${listText(list)}`
  }
  if (verb === 'clear') {
    const list = await changeMissions($, l => l.filter(m => m.status !== 'done'))
    return `Đã dọn các việc đã xong.\n${listText(list)}`
  }

  const current = await read($, missions)
  const target = current[Number.parseInt(tail, 10) - 1]
  if (target === undefined) return `Không có nhiệm vụ số "${tail}".\n${listText(current)}`
  const list =
    verb === 'remove'
      ? await changeMissions($, l => l.filter(m => m.id !== target.id))
      : await changeMissions($, l => withStatus(l, target.id, verb === 'run' ? 'run' : 'done'))
  return `Đã cập nhật.\n${listText(list)}`
}

// --- Hooks ---------------------------------------------------------------------

export const register: Register = on => {
  let startedAt = 0

  on('session.start', async ($, e, next) => {
    await Promise.all([
      $.command.register({ name: 'blacksite', description: 'Mở bảng điều khiển Blacksite' }),
      $.command.register({
        name: 'nhiemvu',
        description: 'Nhiệm vụ: xem, thêm, chạy, xong, xóa, dọn',
        argumentHint: '[thêm <việc> | chạy <số> | xong <số> | xóa <số> | dọn]',
      }),
      $.command.register({ name: 'arm', description: 'Bật/tắt chế độ báo động: lá chắn chặn chặt hơn' }),
    ])
    await loadMissions($)
    void openPane($)
    await refreshStatus($)

    return next(e)
  })

  on('command.run', { command: 'blacksite' }, async $ => {
    await openPane($)

    return { text: 'Đã mở bảng điều khiển Blacksite.' }
  })

  on('command.run', { command: 'arm' }, async $ => {
    const isArmed = await toggleArm($)

    return {
      text: isArmed
        ? 'Chế độ báo động: BẬT. Lá chắn chặn thêm mọi lệnh xóa (rm, Remove-Item, del), git reset --hard và git clean -f.'
        : 'Chế độ báo động: TẮT.',
    }
  })

  on('command.run', { command: 'nhiemvu' }, async ($, e) => ({ text: await missionCommand($, e.args) }))

  on('tool.call', async ($, e, next) => {
    const command = shellCommand(e.tool, e as unknown as Record<string, unknown>)
    const reason = command ? judge(command, await read($, armed)) : undefined
    const row: ToolRow = {
      id: e.tool_use_id,
      tool: shortTool(e.tool),
      target: targetOf(e as unknown as Record<string, unknown>).slice(0, 80),
      status: reason ? 'deny' : 'run',
      at: await $.clock.now(),
    }
    await update($, tools, list => [row, ...list].slice(0, 8))

    if (reason) {
      await update($, blocked, n => n + 1)
      $.ui.toast(`⚠ ĐÃ CHẶN · ${command.slice(0, 60)}`)
      chime($, 'alarm')
      await refreshStatus($)

      return { deny: denial(reason) }
    }

    const ran = await next(e)
    const status: ToolRow['status'] = ran.deny !== undefined ? 'deny' : ran.isError ? 'err' : 'ok'
    await update($, tools, list => list.map(r => (r.id === row.id ? { ...r, status } : r)))

    return ran
  }).catch(($, e, next) => {
    if (next.called) return next(e)
    const command = shellCommand(e.tool, e as unknown as Record<string, unknown>)
    const reason = command ? judge(command, false) : undefined

    return reason ? { deny: denial(reason) } : next(e)
  })

  on('session.measure', async ($, e, next) => {
    const ctx = e.context.percent
    const limit = e.rateLimits.find(r => r.kind === 'five_hour')?.percentUsed
    const before = await read($, usage)
    if (before.ctx !== ctx || before.limit !== limit) {
      await update($, usage, () => ({ ctx, limit }))
      await refreshStatus($)
    }

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    startedAt = await $.clock.now()

    return next(e)
  })

  // A long turn ends with a chime, so the person can look away while it runs
  on('turn.complete', async ($, e, next) => {
    if (startedAt > 0 && (await $.clock.now()) - startedAt >= 20_000) chime($, 'done')
    startedAt = 0

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const [list, rows, count, use, isArmed] = await Promise.all([
      read($, missions),
      read($, tools),
      read($, blocked),
      read($, usage),
      read($, armed),
    ])
    const barWidth = Math.max(6, Math.min(20, e.props.bodyColumns - 26))
    const heading = (label: string) => (
      <Text color={C.gold} weight="semibold" size="caption">
        {label}
      </Text>
    )

    return (
      <Box flexDirection="column" gap={1} paddingX={1}>
        <Box flexDirection="column">
          <Text color={isArmed ? C.red : C.gold} weight="bold" size="heading">
            ◤ BLACKSITE // CLAUDE
          </Text>
          <Text color={isArmed ? C.red : C.ok} size="caption">
            {isArmed ? '◉ CHẾ ĐỘ BÁO ĐỘNG · lá chắn siết chặt' : '● Lá chắn đang bật'}
          </Text>
        </Box>

        <Box flexDirection="column">
          {heading('NHIỆM VỤ')}
          {list.length === 0 && <Text color={C.ash}>{'Chưa có việc. Gõ /nhiemvu thêm <việc>'}</Text>}
          {list.map(m => (
            <Button
              key={m.id}
              plain
              onPress={() =>
                changeMissions($, l => {
                  const now = l.find(x => x.id === m.id)
                  return now ? withStatus(l, m.id, NEXT_STATUS[now.status]) : l
                })
              }
            >
              <Text color={m.status === 'done' ? C.ash : C.champagne} strikethrough={m.status === 'done'}>
                {m.text}
              </Text>{' '}
              <Text color={STATUS[m.status].color} size="caption" weight="semibold">
                {STATUS[m.status].label}
              </Text>
            </Button>
          ))}
        </Box>

        <Box flexDirection="column">
          {heading('TÀI NGUYÊN')}
          <Box flexDirection="row" justifyContent="space-between">
            <Text color={C.champagne}>Bộ nhớ hội thoại</Text>
            <Text color={C.champagne} mono tabular>
              {use.ctx === undefined ? '—' : `${use.ctx}%`}
            </Text>
          </Box>
          <Text color={(use.ctx ?? 0) >= 80 ? C.red : C.gold} mono>
            {meter(use.ctx, barWidth)}
          </Text>
          <Box flexDirection="row" justifyContent="space-between">
            <Text color={C.champagne}>Hạn mức 5 giờ</Text>
            <Text color={C.champagne} mono tabular>
              {use.limit === undefined ? '—' : `${use.limit}%`}
            </Text>
          </Box>
          <Text color={(use.limit ?? 0) >= 80 ? C.red : C.gold} mono>
            {meter(use.limit, barWidth)}
          </Text>
        </Box>

        <Box flexDirection="column">
          {heading('NHẬT KÝ CÔNG CỤ')}
          {rows.length === 0 && <Text color={C.ash}>Chưa có lệnh nào.</Text>}
          {rows.map(r => (
            <Box flexDirection="row" gap={1}>
              <Text color={C.ash} mono tabular>
                {clockText(r.at)}
              </Text>
              <Text color={ROW[r.status].color} mono weight="semibold">
                {ROW[r.status].label}
              </Text>
              <Text color={C.champagne} mono>
                {r.tool}
              </Text>
              <Box flexGrow={1} flexShrink={1} minWidth={0}>
                <Text color={C.ash} mono wrap="truncate-end">
                  {r.target}
                </Text>
              </Box>
            </Box>
          ))}
        </Box>

        <Box flexDirection="column">
          {heading('LÁ CHẮN')}
          <Box flexDirection="row" gap={1} alignItems="flex-end">
            <Text color={C.red} weight="bold" size="title" tabular>
              {String(count)}
            </Text>
            <Text color={C.ash} size="caption">
              LỆNH ĐÃ CHẶN
            </Text>
          </Box>
          <Text color={C.champagne}>■ rm -rf · Remove-Item -Recurse -Force · rd /s /q</Text>
          <Text color={C.champagne}>■ git push --force · format · mkfs · dd</Text>
          <Text color={isArmed ? C.champagne : C.ash}>
            {isArmed ? '■ Thêm: mọi lệnh xóa · git reset --hard · git clean' : '□ Bật báo động để chặn thêm lệnh xóa'}
          </Text>
          <Box flexDirection="row">
            <Button
              key="arm"
              label={isArmed ? 'Tắt báo động' : 'Bật báo động'}
              variant={isArmed ? 'primary' : 'secondary'}
              onPress={() => toggleArm($)}
            />
          </Box>
        </Box>

        <Text color={C.ash} size="caption">
          {'Bấm vào việc để đổi trạng thái · /nhiemvu thêm <việc>'}
        </Text>
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const [list, count, isArmed] = await Promise.all([read($, missions), read($, blocked), read($, armed)])
    const current = list.find(m => m.status === 'run')

    return (
      <Box flexDirection="row" columnGap={2} backgroundColor={C.panel} paddingX={1}>
        <Text color={isArmed ? C.red : C.gold} weight="bold">
          {isArmed ? '◉ BÁO ĐỘNG' : '◆ NHIỆM VỤ'}
        </Text>
        <Box flexGrow={1} flexShrink={1} minWidth={0}>
          <Text color={C.champagne} wrap="truncate-end">
            {current ? current.text : 'Chưa có việc đang chạy · /nhiemvu thêm <việc>'}
          </Text>
        </Box>
        <Text color={count > 0 ? C.red : C.ash}>⛨ {String(count)} đã chặn</Text>
      </Box>
    )
  })
}
