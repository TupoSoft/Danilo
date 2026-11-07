import provjeri from 'node:assert/strict'
import { test as testiraj, type TestContext as KontekstTesta, type Mock as Zamjena } from 'node:test'
import { Bot, Api as TelegramApi } from 'grammy'
import radnik, { type OkruzenjeRadnika } from '../src/cloudflare/worker.js'
import { CRON_MOTIVACIJE, CRON_STATISTIKE } from '../src/cloudflare/cron.ts'
import { PripremaStatistike } from '../src/priprema-statistike.js'
import { GeneratorMotivacionihCitata } from '../src/generator-motivacionih-citata.js'
import type { VezivanjeToka } from '../src/cloudflare/pokretac-toka.js'
import { konfiguracijaRadnika } from '../src/cloudflare/konfiguracija.js'

const probnoOkruzenje = {
    BOT_TOKEN: '123:probni-token',
    BOT_USERNAME: 'danilo_test_bot',
    TELEGRAM_WEBHOOK_SECRET: 'probna-tajna',
    GITHUB_TOKEN: 'probni-github-token',
    GITHUB_ORG: 'probna-organizacija',
    OPENAI_API_TOKEN: 'probni-openai-token',
    ADMIN_TELEGRAM_IDS: '123',
    TELEGRAM_CHAT_ID: '-456',
    OKRUZENJE: 'probno',
}

void testiraj('Worker prihvata konfiguraciju razgovora bez ID-a unaprijed zadate teme', () => {
    const konfiguracija = konfiguracijaRadnika(probnoOkruzenje)

    provjeri.equal(konfiguracija.idTelegramRazgovora, -456)
})

function novost(tekst = '/stats', novostId = 987, korisnikId = 123): Record<string, unknown> {
    return {
        update_id: novostId,
        message: {
            message_id: 1,
            date: 0,
            message_thread_id: 42,
            from: { id: korisnikId, is_bot: false, first_name: 'Admin' },
            chat: { id: -123, type: 'supergroup', title: 'Probni razgovor' },
            text: tekst,
            entities: tekst.startsWith('/') ? [{ type: 'bot_command', offset: 0, length: tekst.length }] : [],
        },
    }
}

function zahtjev(ulaz: unknown = novost(), tajna = probnoOkruzenje.TELEGRAM_WEBHOOK_SECRET): Request {
    return new Request('https://danilo.test/telegram', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': tajna },
        body: JSON.stringify(ulaz),
    })
}

interface PostavkaVezivanja {
    vezivanje: VezivanjeToka
    napravi: Zamjena<VezivanjeToka['create']>
    pronadji: Zamjena<VezivanjeToka['get']>
}

interface PostavkaRadnika {
    okruzenje: OkruzenjeRadnika
    statistika: PostavkaVezivanja
    motivacija: PostavkaVezivanja
    posaljiPoruku: Zamjena<TelegramApi['sendMessage']>
    postaviReakciju: Zamjena<TelegramApi['setMessageReaction']>
    pripremaStatistike: Zamjena<PripremaStatistike['pripremi']>
    generisanjeMotivacije: Zamjena<GeneratorMotivacionihCitata['generisi']>
    mreza: Zamjena<typeof fetch>
    greske: Zamjena<typeof console.error>
}

function pripremiVezivanje(kontekst: KontekstTesta): PostavkaVezivanja {
    const vezivanje: VezivanjeToka = {
        async create({ id }) {
            return await Promise.resolve({ id, status: async () => await Promise.resolve({ status: 'queued' }) })
        },
        async get() {
            return await Promise.reject(new Error('Instanca ne postoji.'))
        },
    }
    const napravi = kontekst.mock.method(vezivanje, 'create')
    const pronadji = kontekst.mock.method(vezivanje, 'get')
    return { vezivanje, napravi, pronadji }
}

function pripremi(kontekst: KontekstTesta): PostavkaRadnika {
    const statistika = pripremiVezivanje(kontekst)
    const motivacija = pripremiVezivanje(kontekst)
    const posaljiPoruku = kontekst.mock.method(
        TelegramApi.prototype,
        'sendMessage',
        async () =>
            await Promise.resolve({
                message_id: 100,
                date: 0,
                chat: { id: -123, type: 'private' as const, first_name: 'Admin' },
                text: 'poslato',
            }),
    )
    const postaviReakciju = kontekst.mock.method(
        TelegramApi.prototype,
        'setMessageReaction',
        async (): Promise<true> => await Promise.resolve(true),
    )
    const pripremaStatistike = kontekst.mock.method(
        PripremaStatistike.prototype,
        'pripremi',
        async () => await Promise.reject(new Error('Priprema ne smije početi tokom webhook-a.')),
    )
    const generisanjeMotivacije = kontekst.mock.method(
        GeneratorMotivacionihCitata.prototype,
        'generisi',
        async () => await Promise.reject(new Error('Generisanje ne smije početi tokom webhook-a.')),
    )
    const mreza = kontekst.mock.method(
        globalThis,
        'fetch',
        async () => await Promise.reject(new Error('Neočekivan mrežni zahtjev.')),
    )
    const greske = kontekst.mock.method(console, 'error', () => undefined)
    kontekst.mock.method(console, 'log', () => undefined)
    return {
        okruzenje: {
            ...probnoOkruzenje,
            STATISTIKA_POSLOVI: statistika.vezivanje,
            MOTIVACIJA_POSLOVI: motivacija.vezivanje,
        },
        statistika,
        motivacija,
        posaljiPoruku,
        postaviReakciju,
        pripremaStatistike,
        generisanjeMotivacije,
        mreza,
        greske,
    }
}

function provjeriDaNemaPoslova(postavka: PostavkaRadnika): void {
    for (const { napravi, pronadji } of [postavka.statistika, postavka.motivacija]) {
        provjeri.equal(napravi.mock.callCount(), 0)
        provjeri.equal(pronadji.mock.callCount(), 0)
    }
}

for (const [opis, tajna] of [
    ['nedostajuću', undefined],
    ['praznu', ''],
    ['pogrešnu', 'pogresna-tajna'],
] as const) {
    void testiraj(`grammY odbija ${opis} tajnu bez obrade komande ili poziva servisa`, async kontekst => {
        const postavka = pripremi(kontekst)
        const obrada = kontekst.mock.method(Bot.prototype, 'handleUpdate')
        const ulaz = zahtjev(novost(), tajna)
        if (tajna === undefined) ulaz.headers.delete('X-Telegram-Bot-Api-Secret-Token')

        const odgovor = await radnik.fetch(ulaz, postavka.okruzenje)

        provjeri.equal(odgovor.status, 401)
        provjeri.equal(await odgovor.text(), '')
        provjeri.equal(ulaz.bodyUsed, true)
        provjeri.equal(obrada.mock.callCount(), 0)
        provjeri.equal(postavka.posaljiPoruku.mock.callCount(), 0)
        provjeriDaNemaPoslova(postavka)
        provjeri.equal(postavka.mreza.mock.callCount(), 0)
    })
}

void testiraj(
    'nedostajuća ili prazna podešena webhook tajna vraća neuspjeh konfiguracije bez poziva servisa',
    async kontekst => {
        const postavka = pripremi(kontekst)

        for (const tajna of [undefined, '']) {
            const okruzenje = {
                ...postavka.okruzenje,
                TELEGRAM_WEBHOOK_SECRET: tajna ?? '',
                WEBHOOK_SECRET: probnoOkruzenje.TELEGRAM_WEBHOOK_SECRET,
            }
            if (tajna === undefined) Reflect.deleteProperty(okruzenje, 'TELEGRAM_WEBHOOK_SECRET')
            provjeri.throws(() => konfiguracijaRadnika(okruzenje))

            const ulaz = zahtjev()
            if (ulaz.body === null) throw new Error('Očekivano tijelo zahtjeva.')
            const citanje = kontekst.mock.method(ulaz.body, 'getReader')

            const odgovor = await radnik.fetch(ulaz, okruzenje)

            provjeri.equal(odgovor.status, 503)
            provjeri.equal(await odgovor.text(), '')
            provjeri.equal(ulaz.bodyUsed, false)
            provjeri.equal(citanje.mock.callCount(), 0)
        }

        provjeriDaNemaPoslova(postavka)
        provjeri.equal(postavka.posaljiPoruku.mock.callCount(), 0)
        provjeri.equal(postavka.mreza.mock.callCount(), 0)
    },
)

void testiraj('obične Worker rute nikada ne registruju niti uklanjaju webhook', async kontekst => {
    const postavka = pripremi(kontekst)
    const registracija = kontekst.mock.method(
        TelegramApi.prototype,
        'setWebhook',
        async () => await Promise.reject(new Error('Registracija webhook-a pripada operativnoj komandi.')),
    )
    const uklanjanje = kontekst.mock.method(
        TelegramApi.prototype,
        'deleteWebhook',
        async () => await Promise.reject(new Error('Uklanjanje webhook-a pripada operativnoj komandi.')),
    )
    await radnik.fetch(new Request('https://danilo.test/zdravlje'), postavka.okruzenje)
    await radnik.fetch(zahtjev(novost('/start')), postavka.okruzenje)
    await radnik.fetch(zahtjev(), postavka.okruzenje)
    provjeri.equal(registracija.mock.callCount(), 0)
    provjeri.equal(uklanjanje.mock.callCount(), 0)
})

void testiraj('zdravlje i rutiranje ne zahtijevaju konfiguraciju ni spoljne pozive', async kontekst => {
    const postavka = pripremi(kontekst)
    const okruzenje = { ...postavka.okruzenje, BOT_TOKEN: '' }
    const zdravlje = await radnik.fetch(new Request('https://danilo.test/zdravlje'), okruzenje)
    provjeri.equal(zdravlje.status, 200)
    provjeri.equal(await zdravlje.text(), 'OK')
    provjeri.equal((await radnik.fetch(new Request('https://danilo.test/nepoznato'), okruzenje)).status, 404)
    const pogresanMetod = await radnik.fetch(new Request('https://danilo.test/telegram'), okruzenje)
    provjeri.equal(pogresanMetod.status, 405)
    provjeri.equal(pogresanMetod.headers.get('Allow'), 'POST')
    provjeri.equal(postavka.mreza.mock.callCount(), 0)
    provjeriDaNemaPoslova(postavka)
})

void testiraj('HTTP rute čuvaju tačne putanje, metode i prazne odgovore grešaka', async kontekst => {
    const postavka = pripremi(kontekst)
    const slucajevi = [
        { metod: 'GET', putanja: '/zdravlje', status: 200, tijelo: 'OK' },
        { metod: 'GET', putanja: '/zdravlje?provjera=1', status: 200, tijelo: 'OK' },
        { metod: 'HEAD', putanja: '/zdravlje', status: 404 },
        { metod: 'POST', putanja: '/zdravlje', status: 404 },
        { metod: 'OPTIONS', putanja: '/zdravlje', status: 404 },
        { metod: 'GET', putanja: '/zdravlje/', status: 404 },
        { metod: 'GET', putanja: '/Zdravlje', status: 404 },
        { metod: 'GET', putanja: '/%7Azdravlje', status: 404 },
        { metod: 'GET', putanja: '/nepoznato', status: 404 },
        { metod: 'GET', putanja: '/telegram', status: 405, dozvoljeno: 'POST' },
        { metod: 'HEAD', putanja: '/telegram', status: 405, dozvoljeno: 'POST' },
        { metod: 'PUT', putanja: '/telegram', status: 405, dozvoljeno: 'POST' },
        { metod: 'DELETE', putanja: '/telegram', status: 405, dozvoljeno: 'POST' },
        { metod: 'OPTIONS', putanja: '/telegram', status: 405, dozvoljeno: 'POST' },
        { metod: 'POST', putanja: '/telegram?provjera=1', status: 400 },
        { metod: 'POST', putanja: '/telegram/', status: 404 },
        { metod: 'POST', putanja: '/Telegram', status: 404 },
        { metod: 'POST', putanja: '/%74elegram', status: 404 },
    ]

    for (const { metod, putanja, status, tijelo = '', dozvoljeno } of slucajevi) {
        const opis = `${metod} ${putanja}`
        const odgovor = await radnik.fetch(
            new Request(`https://danilo.test${putanja}`, { method: metod }),
            postavka.okruzenje,
        )
        provjeri.equal(odgovor.status, status, opis)
        provjeri.equal(await odgovor.text(), tijelo, opis)
        provjeri.equal(odgovor.headers.get('Allow'), dozvoljeno ?? null, opis)
    }

    provjeri.equal(postavka.mreza.mock.callCount(), 0)
    provjeriDaNemaPoslova(postavka)
    provjeri.equal(postavka.posaljiPoruku.mock.callCount(), 0)
})

void testiraj('neispravan webhook vraća neuspjeh prije poziva servisa', async kontekst => {
    const postavka = pripremi(kontekst)
    const inicijalizacija = kontekst.mock.method(
        Bot.prototype,
        'init',
        async () => await Promise.reject(new Error('Inicijalizacija ne smije početi prije provjere zahtjeva.')),
    )
    provjeri.equal((await radnik.fetch(zahtjev({ update_id: 1 }), postavka.okruzenje)).status, 400)
    for (const { tijelo, vrstaSadrzaja, status, duzina, tajna = probnoOkruzenje.TELEGRAM_WEBHOOK_SECRET } of [
        { tijelo: '{', vrstaSadrzaja: 'application/json', status: 400 },
        { tijelo: '{', vrstaSadrzaja: 'application/json', status: 400, tajna: 'pogresna-tajna' },
        { tijelo: '', vrstaSadrzaja: 'application/json', status: 400 },
        { tijelo: 'null', vrstaSadrzaja: 'application/json', status: 400 },
        { tijelo: '[]', vrstaSadrzaja: 'application/json', status: 400 },
        { tijelo: JSON.stringify(novost()), vrstaSadrzaja: 'text/plain', status: 400 },
        { tijelo: ' '.repeat(65_537), vrstaSadrzaja: 'application/json', status: 413 },
        { tijelo: ' '.repeat(65_537), vrstaSadrzaja: 'application/json', status: 413, tajna: 'pogresna-tajna' },
        { tijelo: JSON.stringify(novost()), vrstaSadrzaja: 'application/json', status: 413, duzina: '65537' },
    ]) {
        const ulaz = new Request('https://danilo.test/telegram', {
            method: 'POST',
            headers: {
                'content-type': vrstaSadrzaja,
                'X-Telegram-Bot-Api-Secret-Token': tajna,
            },
            body: tijelo,
        })
        if (duzina !== undefined) ulaz.headers.set('content-length', duzina)

        const odgovor = await radnik.fetch(ulaz, postavka.okruzenje)

        provjeri.equal(odgovor.status, status)
        provjeri.equal(await odgovor.text(), '')
        if (duzina !== undefined) provjeri.equal(ulaz.bodyUsed, false)
    }
    provjeri.equal(inicijalizacija.mock.callCount(), 0)
    provjeri.equal(postavka.posaljiPoruku.mock.callCount(), 0)
    provjeriDaNemaPoslova(postavka)
    provjeri.equal(postavka.mreza.mock.callCount(), 0)
})

void testiraj('Hono odbija preveliko tijelo u toku bez Content-Length', async kontekst => {
    const postavka = pripremi(kontekst)
    const inicijalizacija = kontekst.mock.method(
        Bot.prototype,
        'init',
        async () => await Promise.reject(new Error('Inicijalizacija ne smije početi prije provjere zahtjeva.')),
    )
    const bajtovi = new TextEncoder().encode(JSON.stringify({ ...novost(), dodatno: 'x'.repeat(65_536) }))

    const tijelo = new ReadableStream<Uint8Array>({
        start(kontroler) {
            kontroler.enqueue(bajtovi.subarray(0, 32_768))
            kontroler.enqueue(bajtovi.subarray(32_768))
            kontroler.close()
        },
    })
    const opcije = {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'X-Telegram-Bot-Api-Secret-Token': probnoOkruzenje.TELEGRAM_WEBHOOK_SECRET,
        },
        body: tijelo,
        duplex: 'half',
    }
    const ulaz = new Request('https://danilo.test/telegram', opcije)
    provjeri.equal(ulaz.headers.get('content-length'), null)

    const odgovor = await radnik.fetch(ulaz, postavka.okruzenje)

    provjeri.equal(odgovor.status, 413)
    provjeri.equal(await odgovor.text(), '')
    provjeri.equal(inicijalizacija.mock.callCount(), 0)
    provjeriDaNemaPoslova(postavka)
    provjeri.equal(postavka.posaljiPoruku.mock.callCount(), 0)
    provjeri.equal(postavka.mreza.mock.callCount(), 0)
})

void testiraj('Hono bodyLimit se oslanja na manji deklarisani Content-Length', async kontekst => {
    const postavka = pripremi(kontekst)
    const ulaz = zahtjev({ ...novost(), dodatno: 'x'.repeat(65_536) })
    ulaz.headers.set('content-length', '2')

    const odgovor = await radnik.fetch(ulaz, postavka.okruzenje)

    provjeri.equal(odgovor.status, 200)
    provjeri.equal(ulaz.bodyUsed, true)
    provjeri.equal(postavka.statistika.napravi.mock.callCount(), 1)
    provjeri.equal(postavka.posaljiPoruku.mock.callCount(), 1)
    provjeri.equal(postavka.mreza.mock.callCount(), 0)
})

void testiraj('Hono zamjenjuje neispravni UTF-8 bajt unutar ispravnog JSON-a', async kontekst => {
    const postavka = pripremi(kontekst)
    const obrada = kontekst.mock.method(Bot.prototype, 'handleUpdate')
    const tekst = JSON.stringify(novost('/start'))
    const bajtovi = new TextEncoder().encode(tekst)
    bajtovi[tekst.indexOf('Admin')] = 0xff
    const ulaz = new Request('https://danilo.test/telegram', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'X-Telegram-Bot-Api-Secret-Token': probnoOkruzenje.TELEGRAM_WEBHOOK_SECRET,
        },
        body: bajtovi,
    })

    const odgovor = await radnik.fetch(ulaz, postavka.okruzenje)

    provjeri.equal(odgovor.status, 200)
    provjeri.equal(obrada.mock.calls[0].arguments[0].message?.from.first_name, '\uFFFDdmin')
    provjeri.equal(postavka.posaljiPoruku.mock.callCount(), 1)
    provjeriDaNemaPoslova(postavka)
    provjeri.equal(postavka.mreza.mock.callCount(), 0)
})

void testiraj('grammY obrađuje provjerenu novost bez ponovnog čitanja tijela zahtjeva', async kontekst => {
    const postavka = pripremi(kontekst)
    const ulaz = zahtjev()
    const citanje = kontekst.mock.method(Request.prototype, 'text')
    const procitajJSON = kontekst.mock.method(
        Request.prototype,
        'json',
        async () => await Promise.reject(new Error('Tijelo je već provjereno i pročitano.')),
    )

    const odgovor = await radnik.fetch(ulaz, postavka.okruzenje)

    provjeri.equal(odgovor.status, 200)
    provjeri.equal(await odgovor.text(), '')
    provjeri.equal(ulaz.bodyUsed, true)
    provjeri.equal(citanje.mock.callCount(), 1)
    provjeri.equal(procitajJSON.mock.callCount(), 0)
    provjeri.equal(postavka.statistika.napravi.mock.callCount(), 1)
    provjeri.equal(postavka.posaljiPoruku.mock.callCount(), 1)
    provjeri.equal(postavka.mreza.mock.callCount(), 0)
})

void testiraj('grammY prima novost poslije transformacije i uklanjanja nepoznatih polja', async kontekst => {
    const postavka = pripremi(kontekst)
    const obrada = kontekst.mock.method(Bot.prototype, 'handleUpdate')
    const ocekivanaNovost = novost()
    const { message: poruka } = ocekivanaNovost
    provjeri.ok(typeof poruka === 'object' && poruka !== null)
    const ulaz = zahtjev({
        ...ocekivanaNovost,
        dodatno: 'nepoznato polje',
        message: {
            ...poruka,
            dodatno: 'nepoznato polje',
            entities: [
                { type: 'bot_command', offset: 0, length: 6, dodatno: 'nepoznato polje' },
                { type: 'bold', offset: 0, length: 6 },
            ],
        },
    })

    const odgovor = await radnik.fetch(ulaz, postavka.okruzenje)

    provjeri.equal(odgovor.status, 200)
    provjeri.equal(obrada.mock.callCount(), 1)
    provjeri.deepEqual(obrada.mock.calls[0].arguments[0], ocekivanaNovost)
    provjeri.equal(postavka.statistika.napravi.mock.callCount(), 1)
    provjeri.equal(postavka.posaljiPoruku.mock.callCount(), 1)
    provjeri.equal(postavka.mreza.mock.callCount(), 0)
})

void testiraj(
    'istovremeni webhook zahtjevi čuvaju okruženje, bota i odredište bez dupliranja obrade',
    async kontekst => {
        const postavka = pripremi(kontekst)
        const drugaStatistika = pripremiVezivanje(kontekst)
        const drugaMotivacija = pripremiVezivanje(kontekst)
        const drugoOkruzenje: OkruzenjeRadnika = {
            ...postavka.okruzenje,
            OKRUZENJE: 'drugo',
            BOT_TOKEN: '456:drugi-probni-token',
            BOT_USERNAME: 'drugi_test_bot',
            TELEGRAM_WEBHOOK_SECRET: 'druga-probna-tajna',
            ADMIN_TELEGRAM_IDS: '321',
            STATISTIKA_POSLOVI: drugaStatistika.vezivanje,
            MOTIVACIJA_POSLOVI: drugaMotivacija.vezivanje,
        }
        const trenutak = new Date('2026-07-15T21:55:00.000Z')
        kontekst.mock.timers.enable({ apis: ['Date'], now: trenutak })
        const prihvatanja: Array<() => void> = []
        for (const statistika of [postavka.statistika, drugaStatistika]) {
            statistika.napravi.mock.mockImplementation(async ({ id }) => {
                await new Promise<void>(razrijesi => prihvatanja.push(razrijesi))
                return await Promise.resolve({ id, status: async () => await Promise.resolve({ status: 'queued' }) })
            })
        }
        const slucajevi = [
            {
                novostId: 987,
                razgovorId: -123,
                nitId: 42,
                korisnikId: 123,
                botId: '123',
                okruzenje: postavka.okruzenje,
                statistika: postavka.statistika,
            },
            {
                novostId: 988,
                razgovorId: -456,
                nitId: 77,
                korisnikId: 321,
                botId: '456',
                okruzenje: drugoOkruzenje,
                statistika: drugaStatistika,
            },
        ]
        const obrade = slucajevi.map(async ({ novostId, razgovorId, nitId, korisnikId, okruzenje }) => {
            const ulaz = novost('/stats', novostId, korisnikId)
            const { message: poruka } = ulaz
            provjeri.ok(typeof poruka === 'object' && poruka !== null)
            return await radnik.fetch(
                zahtjev(
                    {
                        ...ulaz,
                        message: {
                            ...poruka,
                            chat: { id: razgovorId, type: 'supergroup', title: 'Probni razgovor' },
                            message_thread_id: nitId,
                        },
                    },
                    okruzenje.TELEGRAM_WEBHOOK_SECRET,
                ),
                okruzenje,
            )
        })

        try {
            for (let pokusaj = 0; pokusaj < 1000 && prihvatanja.length < 2; pokusaj++) {
                await new Promise(razrijesi => setImmediate(razrijesi))
            }
            provjeri.equal(postavka.statistika.napravi.mock.callCount(), 1)
            provjeri.equal(drugaStatistika.napravi.mock.callCount(), 1)
            provjeri.equal(postavka.posaljiPoruku.mock.callCount(), 0)
        } finally {
            for (const prihvati of prihvatanja.reverse()) prihvati()
            await Promise.all(obrade)
        }

        for (const obrada of obrade) provjeri.equal((await obrada).status, 200)
        provjeri.equal(postavka.posaljiPoruku.mock.callCount(), 2)
        for (const { novostId, razgovorId, nitId, botId, okruzenje, statistika } of slucajevi) {
            provjeri.equal(statistika.napravi.mock.callCount(), 1)
            const {
                napravi: {
                    mock: {
                        calls: [
                            {
                                arguments: [posao],
                            },
                        ],
                    },
                },
            } = statistika
            provjeri.equal(posao.id, `${okruzenje.OKRUZENJE}-${botId}-update-${novostId}`)
            provjeri.deepEqual(posao.params, {
                vrsta: 'statistika',
                izvor: 'rucni',
                odrediste: { razgovorId, nitId },
                trenutakIzvjestaja: trenutak.toISOString(),
            })
            const potvrda = postavka.posaljiPoruku.mock.calls.find(poziv => poziv.arguments[0] === razgovorId)
            provjeri.equal(potvrda?.arguments[1], 'Zahtjev je prihvaćen.')
            provjeri.equal(potvrda.arguments[2]?.message_thread_id, nitId)
            const { this: klijent } = potvrda
            provjeri.ok(klijent instanceof TelegramApi)
            provjeri.equal(klijent.token, okruzenje.BOT_TOKEN)
        }
        provjeri.equal(postavka.motivacija.napravi.mock.callCount(), 0)
        provjeri.equal(drugaMotivacija.napravi.mock.callCount(), 0)
        provjeri.equal(postavka.mreza.mock.callCount(), 0)
    },
)

for (const [komanda, vrsta] of [
    ['/stats', 'statistika'],
    ['/motivate', 'motivacija'],
] as const) {
    void testiraj(`${komanda} potvrđuje tek trajno prihvaćen posao i ne priprema sadržaj`, async kontekst => {
        const postavka = pripremi(kontekst)
        const vezivanje = vrsta === 'statistika' ? postavka.statistika : postavka.motivacija
        const drugoVezivanje = vrsta === 'statistika' ? postavka.motivacija : postavka.statistika
        const trenutak = new Date('2026-07-15T21:55:00.000Z')
        kontekst.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: trenutak })
        let prihvati = (): void => {
            throw new Error('Nedostaje potvrda prihvatanja.')
        }
        const prihvatanje = new Promise<void>(razrijesi => {
            prihvati = razrijesi
        })
        vezivanje.napravi.mock.mockImplementation(async ({ id }) => {
            await prihvatanje
            return await Promise.resolve({ id, status: async () => await Promise.resolve({ status: 'queued' }) })
        })
        let zavrseno = false
        const obrada = radnik.fetch(zahtjev(novost(komanda)), postavka.okruzenje).then(odgovor => {
            zavrseno = true
            return odgovor
        })
        // Sačekaj da provjera tijela i obrada grammY-a stignu do trajnog prihvatanja.
        for (let pokusaj = 0; pokusaj < 1000 && vezivanje.napravi.mock.callCount() === 0; pokusaj++) {
            await new Promise(razrijesi => setImmediate(razrijesi))
        }
        provjeri.equal(vezivanje.napravi.mock.callCount(), 1)
        provjeri.equal(drugoVezivanje.napravi.mock.callCount(), 0)
        provjeri.equal(drugoVezivanje.pronadji.mock.callCount(), 0)
        kontekst.mock.timers.tick(9_999)
        await new Promise(razrijesi => setImmediate(razrijesi))
        provjeri.equal(zavrseno, false)
        provjeri.equal(postavka.posaljiPoruku.mock.callCount(), 0)
        provjeri.equal(postavka.pripremaStatistike.mock.callCount(), 0)
        provjeri.equal(postavka.generisanjeMotivacije.mock.callCount(), 0)
        prihvati()
        provjeri.equal((await obrada).status, 200)
        provjeri.deepEqual(vezivanje.napravi.mock.calls[0].arguments, [
            {
                id: 'probno-123-update-987',
                params: {
                    vrsta,
                    izvor: 'rucni',
                    odrediste: { razgovorId: -123, nitId: 42 },
                    trenutakIzvjestaja: trenutak.toISOString(),
                },
                retention: { successRetention: '30 days', errorRetention: '30 days' },
            },
        ])
        provjeri.deepEqual(
            postavka.posaljiPoruku.mock.calls.map(({ arguments: [razgovor, tekst, opcije] }) => ({
                razgovor,
                tekst,
                nit: opcije?.message_thread_id,
            })),
            [{ razgovor: -123, tekst: 'Zahtjev je prihvaćen.', nit: 42 }],
        )
        provjeri.equal(postavka.pripremaStatistike.mock.callCount(), 0)
        provjeri.equal(postavka.generisanjeMotivacije.mock.callCount(), 0)
        provjeri.equal(postavka.mreza.mock.callCount(), 0)
    })
}

void testiraj('podrazumijevani grammY rok vraća prazan 503 nakon deset sekundi bez potvrde posla', async kontekst => {
    const postavka = pripremi(kontekst)
    const obradaBota = kontekst.mock.method(Bot.prototype, 'handleUpdate')
    kontekst.mock.timers.enable({ apis: ['setTimeout'] })
    let prihvati = (): void => {
        throw new Error('Nedostaje potvrda prihvatanja.')
    }
    const prihvatanje = new Promise<void>(razrijesi => {
        prihvati = razrijesi
    })
    postavka.statistika.napravi.mock.mockImplementation(async ({ id }) => {
        await prihvatanje
        return await Promise.resolve({ id, status: async () => await Promise.resolve({ status: 'queued' }) })
    })
    let zavrseno = false
    const obrada = radnik.fetch(zahtjev(), postavka.okruzenje).then(odgovor => {
        zavrseno = true
        return odgovor
    })
    for (let pokusaj = 0; pokusaj < 1000 && postavka.statistika.napravi.mock.callCount() === 0; pokusaj++) {
        await new Promise(razrijesi => setImmediate(razrijesi))
    }
    provjeri.equal(postavka.statistika.napravi.mock.callCount(), 1)

    try {
        kontekst.mock.timers.tick(9_999)
        await new Promise(razrijesi => setImmediate(razrijesi))
        provjeri.equal(zavrseno, false)
        provjeri.equal(postavka.posaljiPoruku.mock.callCount(), 0)

        kontekst.mock.timers.tick(1)
        const odgovor = await obrada

        provjeri.equal(odgovor.status, 503)
        provjeri.equal(await odgovor.text(), '')
        provjeri.equal(postavka.posaljiPoruku.mock.callCount(), 0)
        provjeri.deepEqual(
            postavka.greske.mock.calls.map(poziv => poziv.arguments),
            [[{ dogadjaj: 'Neuspjela obrada webhook-a' }]],
        )
        provjeri.equal(postavka.mreza.mock.callCount(), 0)
    } finally {
        // Istek roka ne otkazuje obradu; završi je prije vraćanja zamijenjenih metoda.
        prihvati()
        await obradaBota.mock.calls[0].result
        await new Promise(razrijesi => setImmediate(razrijesi))
    }
})

for (const [komanda, vrsta] of [
    ['/stats', 'statistika'],
    ['/motivate', 'motivacija'],
] as const) {
    void testiraj(`${komanda} ponavlja istu instancu samo u svom toku rada`, async kontekst => {
        const postavka = pripremi(kontekst)
        const vezivanje = vrsta === 'statistika' ? postavka.statistika : postavka.motivacija
        const drugoVezivanje = vrsta === 'statistika' ? postavka.motivacija : postavka.statistika
        const postojece = new Set<string>()
        vezivanje.napravi.mock.mockImplementation(async ({ id }) => {
            if (postojece.has(id)) throw new Error('Duplikat.')
            postojece.add(id)
            return await Promise.resolve({ id, status: async () => await Promise.resolve({ status: 'queued' }) })
        })
        vezivanje.pronadji.mock.mockImplementation(
            async id =>
                await Promise.resolve({ id, status: async () => await Promise.resolve({ status: 'complete' }) }),
        )
        provjeri.equal((await radnik.fetch(zahtjev(novost(komanda)), postavka.okruzenje)).status, 200)
        provjeri.equal((await radnik.fetch(zahtjev(novost(komanda)), postavka.okruzenje)).status, 200)
        provjeri.equal(postojece.size, 1)
        provjeri.deepEqual(
            vezivanje.napravi.mock.calls.map(poziv => poziv.arguments[0].id),
            ['probno-123-update-987', 'probno-123-update-987'],
        )
        provjeri.deepEqual(
            vezivanje.pronadji.mock.calls.map(poziv => poziv.arguments),
            [['probno-123-update-987']],
        )
        provjeri.equal(drugoVezivanje.napravi.mock.callCount(), 0)
        provjeri.equal(drugoVezivanje.pronadji.mock.callCount(), 0)
    })

    void testiraj(
        `${komanda} pri neuspjehu prihvatanja vraća 503 bez potvrde ili osjetljivih zapisa`,
        async kontekst => {
            const postavka = pripremi(kontekst)
            const vezivanje = vrsta === 'statistika' ? postavka.statistika : postavka.motivacija
            const drugoVezivanje = vrsta === 'statistika' ? postavka.motivacija : postavka.statistika
            vezivanje.napravi.mock.mockImplementation(
                async () => await Promise.reject(new Error('https://api.telegram.org/bot123:tajna')),
            )
            provjeri.equal((await radnik.fetch(zahtjev(novost(komanda)), postavka.okruzenje)).status, 503)
            provjeri.equal(postavka.posaljiPoruku.mock.callCount(), 0)
            provjeri.equal(drugoVezivanje.napravi.mock.callCount(), 0)
            provjeri.equal(drugoVezivanje.pronadji.mock.callCount(), 0)
            provjeri.doesNotMatch(
                JSON.stringify(postavka.greske.mock.calls.map(poziv => poziv.arguments)),
                /tajna|telegram\.org/,
            )
        },
    )
}

void testiraj('neuspjelo slanje potvrde poslije prihvatanja posla vraća prazan i bezbjedan 503', async kontekst => {
    const postavka = pripremi(kontekst)
    postavka.posaljiPoruku.mock.mockImplementation(
        async () => await Promise.reject(new Error('TAJNI_TOKEN https://api.telegram.org/bot123:tajna')),
    )

    const odgovor = await radnik.fetch(zahtjev(), postavka.okruzenje)

    provjeri.equal(odgovor.status, 503)
    provjeri.equal(await odgovor.text(), '')
    provjeri.equal(postavka.statistika.napravi.mock.callCount(), 1)
    provjeri.equal(postavka.posaljiPoruku.mock.callCount(), 1)
    provjeri.equal(postavka.greske.mock.callCount(), 1)
    provjeri.doesNotMatch(
        JSON.stringify(postavka.greske.mock.calls.map(poziv => poziv.arguments)),
        /TAJNI_TOKEN|tajna|telegram\.org/,
    )
    provjeri.equal(postavka.mreza.mock.callCount(), 0)
})

for (const greska of [
    new Error('TAJNI_TOKEN https://api.telegram.org/bot123:tajna'),
    'TAJNI_TOKEN https://api.telegram.org/bot123:tajna',
]) {
    void testiraj(
        `HTTP obrada sanitizuje ${greska instanceof Error ? 'Error objekat' : 'drugu bačenu vrijednost'}`,
        async kontekst => {
            const postavka = pripremi(kontekst)
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- Provjeri i ne-Error izuzetke na granici HTTP adaptera.
            kontekst.mock.method(Bot.prototype, 'init', async () => await Promise.reject(greska))
            const ulaz = zahtjev()

            const odgovor = await radnik.fetch(ulaz, postavka.okruzenje)

            provjeri.equal(odgovor.status, 503)
            provjeri.equal(await odgovor.text(), '')
            provjeri.equal(ulaz.bodyUsed, true)
            provjeri.equal(postavka.greske.mock.callCount(), 1)
            provjeri.doesNotMatch(
                JSON.stringify(postavka.greske.mock.calls.map(poziv => poziv.arguments)),
                /TAJNI_TOKEN|tajna|telegram\.org/,
            )
            provjeriDaNemaPoslova(postavka)
            provjeri.equal(postavka.posaljiPoruku.mock.callCount(), 0)
            provjeri.equal(postavka.mreza.mock.callCount(), 0)
        },
    )
}

void testiraj('neovlašćena komanda ne prihvata tok rada', async kontekst => {
    const postavka = pripremi(kontekst)
    provjeri.equal((await radnik.fetch(zahtjev(novost('/stats', 987, 321)), postavka.okruzenje)).status, 200)
    provjeriDaNemaPoslova(postavka)
    provjeri.equal(postavka.posaljiPoruku.mock.calls[0].arguments[1], 'Ovo je Crna Gora, ođe se ne radi \u{1F61C}')
})

void testiraj('kratke komande i obične poruke obrađuju se u grammY-u bez toka rada', async kontekst => {
    const postavka = pripremi(kontekst)
    for (const tekst of ['/start', '/poop', 'LoTuSfLaRe']) {
        provjeri.equal((await radnik.fetch(zahtjev(novost(tekst)), postavka.okruzenje)).status, 200)
    }
    provjeriDaNemaPoslova(postavka)
    provjeri.deepEqual(
        postavka.posaljiPoruku.mock.calls.map(poziv => poziv.arguments[1]),
        ['Ćao Admin! Ovo je Crna Gora, ođe se ne radi \u{1F61C}'],
    )
    provjeri.deepEqual(postavka.postaviReakciju.mock.calls[0].arguments, [
        -123,
        1,
        [{ type: 'emoji', emoji: '\u{1F4A9}' }],
        undefined,
        undefined,
    ])
})

void testiraj('nepoznati raspored i pogrešan lokalni termin ne prihvataju nijedan tok rada', async kontekst => {
    const postavka = pripremi(kontekst)
    const dogadjaj = {
        cron: '0 0 * * *',
        scheduledTime: Date.parse('2026-07-15T21:55:00.000Z'),
        noRetry() {
            throw new Error('Ne treba isključiti ponavljanje zakazivanja.')
        },
    }
    await radnik.scheduled(dogadjaj, postavka.okruzenje)
    await radnik.scheduled(
        { ...dogadjaj, cron: CRON_MOTIVACIJE, scheduledTime: Date.parse('2026-07-15T11:00:00.000Z') },
        postavka.okruzenje,
    )
    provjeriDaNemaPoslova(postavka)
})

for (const [vrsta, izrazRasporeda, trenutak] of [
    ['statistika', CRON_STATISTIKE, '2026-07-15T21:55:00.000Z'],
    ['statistika', CRON_STATISTIKE, '2026-01-15T22:55:00.000Z'],
    ['statistika', CRON_STATISTIKE, '2026-11-02T22:55:05.123Z'],
    ['motivacija', CRON_MOTIVACIJE, '2026-07-15T10:00:00.000Z'],
    ['motivacija', CRON_MOTIVACIJE, '2026-01-15T11:00:00.000Z'],
    ['motivacija', CRON_MOTIVACIJE, '2026-11-03T11:00:58.456Z'],
] as const) {
    void testiraj(`zakazana ${vrsta} koristi svoj tok rada i planirani trenutak ${trenutak}`, async kontekst => {
        const postavka = pripremi(kontekst)
        const vezivanje = vrsta === 'statistika' ? postavka.statistika : postavka.motivacija
        const drugoVezivanje = vrsta === 'statistika' ? postavka.motivacija : postavka.statistika
        kontekst.mock.timers.enable({ apis: ['Date'], now: new Date('2026-07-17T03:00:00.000Z') })
        await radnik.scheduled(
            {
                cron: izrazRasporeda,
                scheduledTime: Date.parse(trenutak),
                noRetry() {
                    throw new Error('Ne treba isključiti ponavljanje zakazivanja.')
                },
            },
            postavka.okruzenje,
        )
        provjeri.equal(vezivanje.napravi.mock.callCount(), 1)
        const {
            napravi: {
                mock: {
                    calls: [
                        {
                            arguments: [prihvaceno],
                        },
                    ],
                },
            },
        } = vezivanje
        provjeri.equal(prihvaceno.id, `probno-123-${vrsta}-${trenutak.slice(0, 10)}`)
        provjeri.deepEqual(prihvaceno.params, {
            vrsta,
            izvor: 'zakazani',
            odrediste: { razgovorId: -456 },
            trenutakIzvjestaja: trenutak,
        })
        provjeri.equal(drugoVezivanje.napravi.mock.callCount(), 0)
        provjeri.equal(drugoVezivanje.pronadji.mock.callCount(), 0)
    })
}
