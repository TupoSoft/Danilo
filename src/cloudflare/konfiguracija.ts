import { z as zod } from 'zod'
import { parsirajKonfiguraciju, type Konfiguracija } from '../okruzenje.js'
import type { Okruzenje } from './tipovi.js'

const sema = zod.object({
    BOT_TOKEN: zod.string().regex(/^[1-9][0-9]*:[A-Za-z0-9_-]+$/),
    BOT_USERNAME: zod.string().regex(/^[A-Za-z0-9_]+bot$/i),
    TELEGRAM_WEBHOOK_SECRET: zod.string().regex(/^[A-Za-z0-9_-]{1,256}$/),
    OKRUZENJE: zod.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/),
    ADMIN_TELEGRAM_IDS: zod.string().regex(/^[1-9][0-9]*(,[1-9][0-9]*)*$/),
    TELEGRAM_CHAT_ID: zod.string().regex(/^-?[1-9][0-9]*$/),
})

type KonfiguracijaRadnika = Konfiguracija & zod.infer<typeof sema> & { idBota: string }

export function konfiguracijaRadnika(
    okruzenje: Omit<Okruzenje, 'STATISTIKA_POSLOVI' | 'MOTIVACIJA_POSLOVI'>,
): KonfiguracijaRadnika {
    const provjereno = sema.parse(okruzenje)

    const osnovno = parsirajKonfiguraciju(okruzenje)

    if (!osnovno.success) throw new Error('Neispravna konfiguracija radnika.')

    const { data: konfiguracija } = osnovno

    const [idBota] = provjereno.BOT_TOKEN.split(':')

    const identifikatori = [
        ...konfiguracija.idJeviTelegramAdministratora,
        konfiguracija.idTelegramRazgovora,
        Number(idBota),
    ]

    if (!identifikatori.every(Number.isSafeInteger)) throw new Error('Neispravni Telegram identifikatori.')

    return { ...konfiguracija, ...provjereno, idBota }
}
