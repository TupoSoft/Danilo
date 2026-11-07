import { Bot } from 'grammy'
import { OpenAI as OpenAIKlijent } from 'openai'
import { GeneratorMotivacionihCitata } from '../generator-motivacionih-citata.js'
import { GeneratorDnevnogPregleda } from '../generator-dnevnog-pregleda.js'
import { PripremaStatistike } from '../priprema-statistike.js'
import { konfiguracijaRadnika } from './konfiguracija.js'
import type { OdredistePosla } from './ugovor-posla.js'
import type { Okruzenje } from './tipovi.js'
import { NULA } from '../konstante.js'

const TELEGRAM_ROK_SEKUNDI = 5
const OPENAI_ROK_MS = 45_000
const DNEVNI_PREGLED_ROK_MS = 180_000

type OkruzenjeServisa = Omit<Okruzenje, 'STATISTIKA_POSLOVI' | 'MOTIVACIJA_POSLOVI'>

export function napraviBot(okruzenje: OkruzenjeServisa): Bot {
    const konfiguracija = konfiguracijaRadnika(okruzenje)

    return new Bot(konfiguracija.tokenBota, {
        botInfo: {
            id: Number(konfiguracija.idBota),
            is_bot: true,
            first_name: 'Danilo',
            username: konfiguracija.BOT_USERNAME,
            can_join_groups: true,
            can_read_all_group_messages: false,
            supports_inline_queries: false,
            can_connect_to_business: false,
            has_main_web_app: false,
        },
        client: { timeoutSeconds: TELEGRAM_ROK_SEKUNDI },
    })
}

export function napraviPripremuStatistike(okruzenje: OkruzenjeServisa): PripremaStatistike {
    const konfiguracija = konfiguracijaRadnika(okruzenje)
    const pisac = new GeneratorDnevnogPregleda(
        new OpenAIKlijent({ apiKey: konfiguracija.openaiApiToken, timeout: DNEVNI_PREGLED_ROK_MS, maxRetries: NULA }),
        konfiguracija.githubOrganizacija,
        konfiguracija.githubToken,
    )

    return new PripremaStatistike(pisac)
}

export function napraviGeneratorMotivacije(okruzenje: OkruzenjeServisa): GeneratorMotivacionihCitata {
    const konfiguracija = konfiguracijaRadnika(okruzenje)
    return new GeneratorMotivacionihCitata(
        new OpenAIKlijent({ apiKey: konfiguracija.openaiApiToken, timeout: OPENAI_ROK_MS, maxRetries: NULA }),
    )
}

export function napraviTelegramIsporuku(
    okruzenje: OkruzenjeServisa,
): (odrediste: OdredistePosla, tekst: string) => Promise<void> {
    const bot = napraviBot(okruzenje)
    return async (odrediste, tekst) => {
        await bot.api.sendMessage(odrediste.razgovorId, tekst, {
            message_thread_id: odrediste.nitId,
            parse_mode: 'HTML',
        })
    }
}
