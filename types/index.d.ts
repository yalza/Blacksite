export type MissionStatus = 'run' | 'wait' | 'done'
export type Mission = { id: string; text: string; status: MissionStatus }
export type ToolRow = {
  id: string
  tool: string
  target: string
  status: 'run' | 'ok' | 'err' | 'deny'
  at: number
}
export type Usage = { ctx?: number; limit?: number }

declare module 'claude-code' {
  interface PluginState {
    blacksite: {
      missions: Shaped<Mission[]>
      tools: Shaped<ToolRow[]>
      blocked: number
      usage: Usage
      armed: boolean
    }
  }
}
