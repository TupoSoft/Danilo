import { Hono, type MiddlewareHandler as HonoPosrednik } from 'hono'
import { bodyLimit as ograniciTijelo } from 'hono/body-limit'
import { webhookCallback, type Bot } from 'grammy'
import { Danilo } from '../danilo.js'
import { konfiguracijaRadnika } from './konfiguracija.js'
import { idRucnogPosla, idZakazanogPosla, parsirajPosao } from './ugovor-posla.js'
import { zakazaniPosao } from './raspored.js'
import { prihvatiTok, type VezivanjeToka } from './pokretac-toka.js'
import { napraviBot } from './zavisnosti.js'
import { semaNovosti } from './webhook.js'
import type { Okruzenje, KontekstIzvrsavanja, KontrolerRasporeda, ObradjivacDogadjaja } from './tipovi.js'

const HTTP_NEISPRAVNO = 400
const HTTP_NEMA_PUTANJE = 404
const HTTP_POGRESAN_METOD = 405
const HTTP_PREVELIKO = 413
const HTTP_NEDOSTUPNO = 503
const MAKSIMALNO_BAJTOVA = 65_536

export type OkruzenjeRadnika = Omit<Okruzenje, 'STATISTIKA_POSLOVI' | 'MOTIVACIJA_POSLOVI'> & {
    STATISTIKA_POSLOVI: VezivanjeToka
    MOTIVACIJA_POSLOVI: VezivanjeToka
}

interface OkruzenjeAplikacije {
    Bindings: OkruzenjeRadnika
    Variables: {
        bot: Bot
        konfiguracija: ReturnType<typeof konfiguracijaRadnika>
    }
}

const pripremiBot: HonoPosrednik<OkruzenjeAplikacije> = async (kontekst, nastavi) => {
    kontekst.set('konfiguracija', konfiguracijaRadnika(kontekst.env))
    kontekst.set('bot', napraviBot(kontekst.env))
    await nastavi()
}

const pripremiTelegram: HonoPosrednik<OkruzenjeAplikacije> = async (kontekst, nastavi) => {
    const {
        req: zahtjev,
        env: okruzenje,
        var: { bot, konfiguracija },
    } = kontekst

    const [medijskiTip] = (zahtjev.header('content-type') ?? '').split(';')
    if (medijskiTip.trim().toLowerCase() !== 'application/json') {
        return kontekst.body(null, HTTP_NEISPRAVNO)
    }

    let ulaz: unknown = null
    try {
        ulaz = await zahtjev.json<unknown>()
    } catch {
        return kontekst.body(null, HTTP_NEISPRAVNO)
    }

    const rezultat = semaNovosti.safeParse(ulaz)
    if (!rezultat.success) return kontekst.body(null, HTTP_NEISPRAVNO)
    const { data: novost } = rezultat

    // grammY dobija rezultat Zod transformacija umjesto izvornog JSON-a.
    zahtjev.bodyCache = { json: Promise.resolve(novost) }

    const trenutakIzvjestaja = new Date().toISOString()

    const danilo = new Danilo(bot, konfiguracija.idJeviTelegramAdministratora, {
        async pokreni({ vrsta, odgovor }) {
            const posao = parsirajPosao({
                vrsta,
                izvor: 'rucni',
                odrediste: { razgovorId: novost.message.chat.id, nitId: novost.message.message_thread_id },
                trenutakIzvjestaja,
            })

            const id = idRucnogPosla(konfiguracija.OKRUZENJE, konfiguracija.idBota, novost.update_id)

            const tok = posao.vrsta === 'statistika' ? okruzenje.STATISTIKA_POSLOVI : okruzenje.MOTIVACIJA_POSLOVI
            await prihvatiTok(tok, id, posao)

            // Ne šalji potvrdu dok trajni sistem ne prihvati posao.
            await odgovor?.('Zahtjev je prihvaćen.')

            console.log({ dogadjaj: 'Posao prihvaćen', id, vrsta })

            return { vrsta: 'prihvaceno' }
        },
    })

    danilo.registrujKomande()

    await nastavi()
}

function odgovorNaGresku(): Response {
    console.error({ dogadjaj: 'Neuspjela obrada webhook-a' })

    return new Response(null, { status: HTTP_NEDOSTUPNO })
}

const aplikacija = new Hono<OkruzenjeAplikacije>({
    strict: true,
    // Sačuvaj postojeći ugovor: kodirane i nekodirane putanje nijesu ista ruta.
    getPath: zahtjev => new URL(zahtjev.url).pathname,
})

aplikacija.get('/zdravlje', kontekst => {
    // Hono automatski povezuje HEAD sa GET; ova krajnja tačka zadržava ugovor samo za GET.
    if (kontekst.req.method !== 'GET') return new Response(null, { status: HTTP_NEMA_PUTANJE })
    return new Response('OK')
})
aplikacija.post(
    '/telegram',
    pripremiBot,
    ograniciTijelo({ maxSize: MAKSIMALNO_BAJTOVA, onError: kontekst => kontekst.body(null, HTTP_PREVELIKO) }),
    pripremiTelegram,
    async kontekst =>
        await webhookCallback(kontekst.var.bot, 'hono', {
            secretToken: kontekst.var.konfiguracija.TELEGRAM_WEBHOOK_SECRET,
        })(kontekst),
)
aplikacija.all('/telegram', () => new Response(null, { status: HTTP_POGRESAN_METOD, headers: { Allow: 'POST' } }))
aplikacija.notFound(() => new Response(null, { status: HTTP_NEMA_PUTANJE }))
aplikacija.onError(odgovorNaGresku)

export default {
    async fetch(zahtjev: Request, okruzenje: OkruzenjeRadnika, kontekst?: KontekstIzvrsavanja): Promise<Response> {
        try {
            return await aplikacija.fetch(zahtjev, okruzenje, kontekst)
        } catch {
            // Hono onError obrađuje Error objekte; ovdje obuhvati i ostale bačene vrijednosti.
            return odgovorNaGresku()
        }
    },

    async scheduled(kontroler: KontrolerRasporeda, okruzenje: OkruzenjeRadnika): Promise<void> {
        try {
            const konfiguracija = konfiguracijaRadnika(okruzenje)

            const posao = zakazaniPosao(kontroler.cron, kontroler.scheduledTime, {
                razgovorId: konfiguracija.idTelegramRazgovora,
            })

            if (posao === undefined) return

            const id = idZakazanogPosla(
                konfiguracija.OKRUZENJE,
                konfiguracija.idBota,
                posao.vrsta,
                new Date(posao.trenutakIzvjestaja),
            )

            const tok = posao.vrsta === 'statistika' ? okruzenje.STATISTIKA_POSLOVI : okruzenje.MOTIVACIJA_POSLOVI
            await prihvatiTok(tok, id, posao)

            console.log({ dogadjaj: 'Zakazani posao prihvaćen', id, vrsta: posao.vrsta })
        } catch {
            console.error({ dogadjaj: 'Neuspjelo zakazivanje posla' })

            throw new Error('Zakazivanje posla nije uspjelo.')
        }
    },
} satisfies ObradjivacDogadjaja
