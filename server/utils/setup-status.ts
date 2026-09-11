import {
  envVarName,
  geminiApiKey,
  isSessionPasswordConfigured,
  llmProvider,
  openaiApiKey,
  spotifyClientId,
  tidalClientId,
} from './env.ts'

export type SetupIssue = {
  id: string
  envVar: string
  message: string
  hint?: string
}

export function getSetupIssues(): SetupIssue[] {
  const issues: SetupIssue[] = []

  if (process.env.NODE_ENV === 'production' && !isSessionPasswordConfigured()) {
    issues.push({
      id: 'session_password',
      envVar: envVarName('SESSION_PASSWORD'),
      message: 'Session encryption key is required in production.',
      hint: 'Generate with: openssl rand -base64 32',
    })
  }

  const hasTidal = Boolean(tidalClientId())
  const hasSpotify = Boolean(spotifyClientId())
  if (!hasTidal && !hasSpotify) {
    issues.push({
      id: 'streaming',
      envVar: `${envVarName('TIDAL_CLIENT_ID')} / ${envVarName('SPOTIFY_CLIENT_ID')}`,
      message: 'At least one streaming OAuth app is required.',
      hint: 'Register an app in the Tidal or Spotify developer dashboard and set the client ID in .env.',
    })
  }

  const locked = llmProvider()
  if (locked === 'openai' && !openaiApiKey()) {
    issues.push({
      id: 'openai_key',
      envVar: envVarName('OPENAI_API_KEY'),
      message: `${envVarName('LLM_PROVIDER')} is set to openai, but ${envVarName('OPENAI_API_KEY')} is missing from .env.`,
      hint: `Add ${envVarName('OPENAI_API_KEY')}=sk-... to .env. Get a key from platform.openai.com/api-keys`,
    })
  } else if (locked === 'gemini' && !geminiApiKey()) {
    issues.push({
      id: 'gemini_key',
      envVar: envVarName('GEMINI_API_KEY'),
      message: `${envVarName('LLM_PROVIDER')} is set to gemini, but ${envVarName('GEMINI_API_KEY')} is missing from .env.`,
      hint: `Add ${envVarName('GEMINI_API_KEY')}=... to .env. Get a key from aistudio.google.com/apikey`,
    })
  } else if (locked === 'anthropic') {
    issues.push({
      id: 'anthropic_unavailable',
      envVar: envVarName('LLM_PROVIDER'),
      message: 'Anthropic is not implemented yet.',
      hint: `Set ${envVarName('LLM_PROVIDER')}=openai or gemini, or remove ${envVarName('LLM_PROVIDER')} to choose in the app.`,
    })
  }

  return issues
}

export function isSetupReady(): boolean {
  return getSetupIssues().length === 0
}
