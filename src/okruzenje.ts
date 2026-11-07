import { z as zod } from 'zod'
import { JEDAN } from './konstante.js'

const tekstualnaSema = zod.string({
    required_error: 'Promjenljiva okruženja je obavezna.',
    invalid_type_error: 'Vrijednost mora biti tekst.',
})
const semaNizaBrojeva = tekstualnaSema.transform(tekst =>
    tekst.split(',').map(identifikator => Number(identifikator.trim())),
)
const nepromjenljivaTekstualnaSema = tekstualnaSema.min(JEDAN, 'Vrijednost ne smije biti prazna.').readonly()
const nepromjenljivaBrojcanaSema = tekstualnaSema.transform(Number).readonly()

const semaPromjenljivihOkruzenja = zod
    .object({
        BOT_TOKEN: nepromjenljivaTekstualnaSema,
        GITHUB_TOKEN: nepromjenljivaTekstualnaSema,
        GITHUB_ORG: nepromjenljivaTekstualnaSema,
        OPENAI_API_TOKEN: nepromjenljivaTekstualnaSema,
        ADMIN_TELEGRAM_IDS: semaNizaBrojeva,
        TELEGRAM_CHAT_ID: nepromjenljivaBrojcanaSema,
    })
    .transform(promjenljive => ({
        tokenBota: promjenljive.BOT_TOKEN,
        githubToken: promjenljive.GITHUB_TOKEN,
        githubOrganizacija: promjenljive.GITHUB_ORG,
        openaiApiToken: promjenljive.OPENAI_API_TOKEN,
        idJeviTelegramAdministratora: promjenljive.ADMIN_TELEGRAM_IDS,
        idTelegramRazgovora: promjenljive.TELEGRAM_CHAT_ID,
    }))

export type Konfiguracija = zod.infer<typeof semaPromjenljivihOkruzenja>

export function parsirajKonfiguraciju(ulaz: Record<string, unknown>): zod.SafeParseReturnType<unknown, Konfiguracija> {
    return semaPromjenljivihOkruzenja.safeParse(ulaz)
}
