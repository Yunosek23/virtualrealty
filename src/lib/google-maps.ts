import { setOptions, importLibrary } from '@googlemaps/js-api-loader'

export const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || ''

setOptions({
  key: GOOGLE_API_KEY,
  version: 'alpha',
} as any)

export { importLibrary }

