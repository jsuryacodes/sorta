import type { Lang } from '../types'
import en, { type Strings } from './en'
import hi from './hi'
import te from './te'

export const STR: Record<Lang, Strings> = { en, hi, te }
export const LANG_NAMES: Record<Lang, string> = { en: 'English', hi: 'हिन्दी', te: 'తెలుగు' }
