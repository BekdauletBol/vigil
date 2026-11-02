import { COUNTRY, OFFSHORE } from '../lib/labels'

/** ISO code chip. Flag emoji are not rendered on Windows, so a text badge is more reliable. */
export function CountryTag({ code, hideDomestic = true }: { code: string; hideDomestic?: boolean }) {
  if (hideDomestic && code === 'KZ') return null
  return (
    <span className={`cc ${OFFSHORE.has(code) ? 'cc--risk' : ''}`} title={COUNTRY[code] ?? code}>
      {code}
    </span>
  )
}
