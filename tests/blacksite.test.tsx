import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

/** What sits beneath the mod in a session: a clock, its store, and the toasts, status and sounds it raises. */
function world(on: On) {
  mock.clock(on, { now: Date.UTC(2026, 9, 29, 13, 0, 0) })
  mock.store(on)
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('audio.play', () => ({ value: undefined }))
}

const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as const

const PANE = {
  plugin: 'blacksite',
  component: 'Pane',
  requestId: 'blacksite',
  props: {
    title: 'Blacksite',
    isFocused: false,
    bodyColumns: 44,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 60 },
    view: {},
  },
} as const

test('the shield refuses rm -rf and a force push, and lets ls run', async ($, on) => {
  world(on)
  on('tool.call', () => ({ result: {} }))

  const wipe = await $.tool.call({ tool: 'Bash', command: 'cd ~ && rm -rf Projects' })
  expect(JSON.stringify(wipe).includes('lá chắn')).toBe(true)

  const push = await $.tool.call({ tool: 'Bash', command: 'git push --force origin main' })
  expect(JSON.stringify(push).includes('git push --force')).toBe(true)

  const lease = await $.tool.call({ tool: 'Bash', command: 'git push --force-with-lease' })
  expect(JSON.stringify(lease).includes('lá chắn')).toBe(false)

  const list = await $.tool.call({ tool: 'Bash', command: 'ls -la' })
  expect(JSON.stringify(list).includes('lá chắn')).toBe(false)
})

test('armed mode also refuses a plain rm', async ($, on) => {
  world(on)
  on('tool.call', () => ({ result: {} }))

  const before = await $.tool.call({ tool: 'Bash', command: 'rm notes.txt' })
  expect(JSON.stringify(before).includes('lá chắn')).toBe(false)

  await $.command.run({ ...RUN, command: 'arm', args: '' })
  const after = await $.tool.call({ tool: 'Bash', command: 'rm notes.txt' })
  expect(JSON.stringify(after).includes('lá chắn')).toBe(true)
})

test('the pane lists the missions on the terminal and desktop', async ($, on) => {
  world(on)
  on('command.register', () => ({ value: { command: 'blacksite' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /Mac mini/ }))?.text).toBe('Bán Mac mini M2 16/256')
    await ui.unmount()
  }
})

test('/nhiemvu adds a mission and marks one done', async ($, on) => {
  world(on)
  const added = await $.command.run({ ...RUN, command: 'nhiemvu', args: 'thêm Viết CV' })
  expect(JSON.stringify(added).includes('Viết CV')).toBe(true)

  const done = await $.command.run({ ...RUN, command: 'nhiemvu', args: 'xong 1' })
  expect(JSON.stringify(done).includes('[XONG] Viết CV')).toBe(true)
})

test('a blocked command shows in the pane log and the band count', async ($, on) => {
  world(on)
  on('tool.call', () => ({ result: {} }))
  await $.tool.call({ tool: 'Bash', command: 'rm -rf /' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const pane = await $.ui.mount({ ...PANE, surface })
    expect((await pane.find({ type: 'Text', text: /^CHẶN$/ }))?.text).toBe('CHẶN')
    await pane.unmount()

    const band = await $.ui.mount({
      plugin: 'blacksite',
      surface,
      component: 'AbovePrompt',
      requestId: 'band',
      props: {
        hasSurvey: false,
        isWorking: false,
        maxRows: 6,
        bodyColumns: 80,
        scroll: { offset: 0, bodyRows: 6 },
        view: {},
      },
    })
    expect((await band.find({ type: 'Text', text: /đã chặn/ }))?.text).toBe('⛨ 1 đã chặn')
    await band.unmount()
  }
})
