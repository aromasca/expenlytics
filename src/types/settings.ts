export interface ProviderConfig {
  name: string
  envKey: string
  models: { id: string; name: string }[]
  defaults: Record<string, string>
}
