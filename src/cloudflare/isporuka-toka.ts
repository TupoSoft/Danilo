import { GrammyError as TelegramGreska } from 'grammy'
import { NonRetryableError as GreskaBezPonavljanja } from 'cloudflare:workflows'
import type { WorkflowDelayFunction as OdlaganjeToka } from 'cloudflare:workers'
import { NULA } from '../konstante.js'
import type { OdredistePosla } from './ugovor-posla.js'

export const NAJVISE_PONAVLJANJA = 3
const EKSPONENT = 2
const PRVI_POKUSAJ = 1
const PRVI_TRAJNI_STATUS = 400
const POSLJEDNJI_TRAJNI_STATUS = 499
const STATUS_PREVISE_ZAHTJEVA = 429
const STATUS_ISTEKLOG_ZAHTJEVA = 408
const PORUKA_NEUSPJEHA = 'Telegram isporuka nije uspjela.'
const PREFIKS_ODLAGANJA = `${PORUKA_NEUSPJEHA} Odlaganje u sekundama: `

export type IsporuciTrajnuPoruku = (odrediste: OdredistePosla, tekst: string) => Promise<void>

// Funkcija već računa eksponencijalno čekanje, pa konfiguracija koraka koristi
// backoff: 'constant' da izvršno okruženje ne pomnoži ponovo ni njega ni Telegram retry_after.
export const odlaganjeIsporuke: OdlaganjeToka = ({ ctx: kontekst, error: greska }) => {
    // Standardna poruka greške opstaje kroz izvršavanja toka rada; ne zavisimo od
    // proizvoljnih svojstava Error objekta niti čuvamo osjetljivu Telegram grešku.
    const odlaganje = greska.message.startsWith(PREFIKS_ODLAGANJA)
        ? Number(greska.message.slice(PREFIKS_ODLAGANJA.length))
        : NULA

    const telegramCekanje = Number.isFinite(odlaganje) && odlaganje > NULA ? odlaganje : NULA

    const { attempt: pokusaj } = kontekst

    return `${Math.max(EKSPONENT ** (pokusaj - PRVI_POKUSAJ), telegramCekanje)} seconds`
}

export async function pokusajIsporuku(
    odrediste: OdredistePosla,
    tekst: string,
    pokusaj: number,
    isporuci: IsporuciTrajnuPoruku,
): Promise<{ vrsta: 'isporuceno' }> {
    try {
        await isporuci(odrediste, tekst)

        return { vrsta: 'isporuceno' }
    } catch (greska) {
        const status = greska instanceof TelegramGreska ? greska.error_code : undefined

        console.error({ dogadjaj: 'Neuspjela Telegram isporuka', pokusaj, status })

        if (
            status !== undefined &&
            status >= PRVI_TRAJNI_STATUS &&
            status <= POSLJEDNJI_TRAJNI_STATUS &&
            status !== STATUS_PREVISE_ZAHTJEVA &&
            status !== STATUS_ISTEKLOG_ZAHTJEVA
        ) {
            throw new GreskaBezPonavljanja(PORUKA_NEUSPJEHA)
        }

        const odlaganje = greska instanceof TelegramGreska ? greska.parameters.retry_after : undefined
        throw new Error(
            odlaganje !== undefined && Number.isFinite(odlaganje) && odlaganje > NULA
                ? `${PREFIKS_ODLAGANJA}${odlaganje}`
                : PORUKA_NEUSPJEHA,
        )
    }
}
