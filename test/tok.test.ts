import provjeri from 'node:assert/strict'
import { registerHooks as registrujModule } from 'node:module'
import { mock as zamjena, test as testiraj } from 'node:test'
import { Api as TelegramApi, GrammyError as TelegramGreska } from 'grammy'
import type {
    WorkflowDelayFunction as OdlaganjeToka,
    WorkflowEvent as DogadjajToka,
    WorkflowStep as KorakToka,
    WorkflowStepConfig as KonfiguracijaKorakaToka,
    WorkflowStepContext as KontekstKorakaToka,
    WorkflowStepRollbackOptions as OpcijePonistavanjaKorakaToka,
} from 'cloudflare:workers'
import type { Okruzenje, KontekstIzvrsavanja, Tragovi, Izvozi, Serijalizovano } from '../src/cloudflare/tipovi.js'
import type { IshodIsporuke, IshodPripreme } from '../src/poslovi.js'
import { PripremaStatistike } from '../src/priprema-statistike.js'
import { GeneratorMotivacionihCitata } from '../src/generator-motivacionih-citata.js'
import type { OdredistePosla, TrajniPosao } from '../src/cloudflare/ugovor-posla.js'
import { prihvatiTok, type VezivanjeToka } from '../src/cloudflare/pokretac-toka.js'
import { NonRetryableError as GreskaBezPonavljanja } from './pomocno/cloudflare-workflows.js'

const ucitavanje = registrujModule({
    resolve(putanja, kontekst, nastavi) {
        if (putanja === 'cloudflare:workers') {
            return { url: new URL('./pomocno/cloudflare-workers.ts', import.meta.url).href, shortCircuit: true }
        }
        if (putanja === 'cloudflare:workflows') {
            return { url: new URL('./pomocno/cloudflare-workflows.ts', import.meta.url).href, shortCircuit: true }
        }
        return nastavi(putanja, kontekst)
    },
})
const [{ TokStatistike }, { TokMotivacije }] = await (async () => {
    try {
        return await Promise.all([
            import('../src/cloudflare/tok-statistike.js'),
            import('../src/cloudflare/tok-motivacije.js'),
        ])
    } finally {
        ucitavanje.deregister()
    }
})()

const posao: TrajniPosao = {
    vrsta: 'statistika',
    izvor: 'rucni',
    odrediste: { razgovorId: -123, nitId: 42 },
    trenutakIzvjestaja: '2026-07-01T21:55:00.000Z',
}

const okruzenje: Okruzenje = {
    BOT_TOKEN: '123:probni-token',
    BOT_USERNAME: 'danilo_test_bot',
    TELEGRAM_WEBHOOK_SECRET: 'probna-tajna',
    GITHUB_TOKEN: 'probni-github-token',
    GITHUB_ORG: 'probno',
    OPENAI_API_TOKEN: 'probni-openai-token',
    ADMIN_TELEGRAM_IDS: '123',
    TELEGRAM_CHAT_ID: '-456',
    OKRUZENJE: 'probno',
    get STATISTIKA_POSLOVI(): Okruzenje['STATISTIKA_POSLOVI'] {
        throw new Error('Tok rada ne pokreće novi statistički posao.')
    },
    get MOTIVACIJA_POSLOVI(): Okruzenje['MOTIVACIJA_POSLOVI'] {
        throw new Error('Tok rada ne pokreće novi motivacioni posao.')
    },
}
const kontekstRadnika: KontekstIzvrsavanja = {
    waitUntil() {
        throw new Error('Tok rada ne koristi waitUntil.')
    },
    passThroughOnException() {
        throw new Error('Tok rada ne koristi passThroughOnException.')
    },
    abort() {
        throw new Error('Tok rada ne prekida kontekst.')
    },
    props: undefined,
    get exports(): Izvozi {
        throw new Error('Tok rada ne koristi izvoze konteksta.')
    },
    get tracing(): Tragovi {
        throw new Error('Automatsko praćenje je isključeno.')
    },
}

function dogadjaj<Posao extends TrajniPosao>(posao: Posao, sadrzaj: unknown): DogadjajToka<Posao> {
    const dogadjaj = {
        payload: posao,
        timestamp: new Date(),
        instanceId: 'probna-instanca',
        workflowName: 'probni-tok',
    }
    Object.defineProperty(dogadjaj, 'payload', { value: sadrzaj })
    return dogadjaj
}

type PripremacStatistike = Pick<PripremaStatistike, 'pripremi'>
type Isporuka = (odrediste: OdredistePosla, tekst: string) => Promise<void>

function zamijeniIsporuku(isporuci: Isporuka): () => void {
    const isporuka = zamjena.method(
        TelegramApi.prototype,
        'sendMessage',
        async (razgovorId: string | number, tekst: string, opcije?: { message_thread_id?: number }) => {
            provjeri.equal(typeof razgovorId, 'number')
            if (typeof razgovorId !== 'number') throw new Error('Očekuje se broj razgovora.')
            await isporuci(
                { razgovorId, ...(opcije?.message_thread_id === undefined ? {} : { nitId: opcije.message_thread_id }) },
                tekst,
            )
            return { message_id: 1, date: 0, chat: { id: -123, type: 'private', first_name: 'Probno' } }
        },
    )
    return () => {
        isporuka.mock.restore()
    }
}

// Zamjenjuju se samo spoljni servisi; svaki poziv izvršava stvarnu run metodu toka rada.
async function pokreniStatistiku(
    ulaz: unknown,
    koraci: KorakToka,
    pripremac: PripremacStatistike,
    isporuci: Isporuka,
): Promise<IshodIsporuke> {
    const priprema = zamjena.method(
        PripremaStatistike.prototype,
        'pripremi',
        async (trenutak?: Date) => await pripremac.pripremi(trenutak),
    )
    const isporuka = zamijeniIsporuku(isporuci)
    try {
        return await new TokStatistike(kontekstRadnika, okruzenje).run(
            dogadjaj({ ...posao, vrsta: 'statistika' }, ulaz),
            koraci,
        )
    } finally {
        priprema.mock.restore()
        isporuka()
    }
}

async function pokreniMotivaciju(
    ulaz: unknown,
    koraci: KorakToka,
    generator: Pick<GeneratorMotivacionihCitata, 'generisi'>,
    isporuci: Isporuka,
): Promise<IshodIsporuke> {
    const generisanje = zamjena.method(
        GeneratorMotivacionihCitata.prototype,
        'generisi',
        async () => await generator.generisi(),
    )
    const isporuka = zamijeniIsporuku(isporuci)
    try {
        return await new TokMotivacije(kontekstRadnika, okruzenje).run(
            dogadjaj({ ...posao, vrsta: 'motivacija' }, ulaz),
            koraci,
        )
    } finally {
        generisanje.mock.restore()
        isporuka()
    }
}

function napraviKorake(greskaPripreme?: Error): {
    koraci: KorakToka
    nazivi: string[]
    cekanja: number[]
    ponavljanja: number[]
    greske: Error[]
} {
    const nazivi: string[] = []
    const cekanja: number[] = []
    const ponavljanja: number[] = []
    const greske: Error[] = []
    const koraci: KorakToka = {
        async do<T extends Serijalizovano<T>>(
            naziv: string,
            opcijeIliIzvrsi: KonfiguracijaKorakaToka | ((kontekst: KontekstKorakaToka) => Promise<T>),
            izvrsi?:
                | ((kontekst: KontekstKorakaToka) => Promise<T>)
                | ((kontekst: KontekstKorakaToka<OdlaganjeToka>) => Promise<T>)
                | OpcijePonistavanjaKorakaToka<T>,
        ): Promise<T> {
            nazivi.push(naziv)
            if (greskaPripreme !== undefined && naziv === 'priprema-poruke') throw greskaPripreme
            const opcije = typeof opcijeIliIzvrsi === 'function' ? undefined : opcijeIliIzvrsi
            const ponovi = opcije?.retries
            ponavljanja.push(ponovi?.limit ?? 0)
            const izvrsiKorak =
                typeof opcijeIliIzvrsi === 'function'
                    ? opcijeIliIzvrsi
                    : typeof izvrsi === 'function'
                      ? izvrsi
                      : undefined
            if (izvrsiKorak === undefined) throw new Error('Nedostaje izvršavanje koraka.')
            for (let pokusaj = 1; ; pokusaj++) {
                const kontekst = {
                    step: { name: naziv, count: 1 },
                    attempt: pokusaj,
                    get config(): never {
                        throw new Error('Ovi koraci ne čitaju svoju konfiguraciju.')
                    },
                }
                try {
                    return await izvrsiKorak(kontekst)
                } catch (greska) {
                    provjeri.ok(greska instanceof Error)
                    greske.push(greska)
                    if (greska instanceof GreskaBezPonavljanja || ponovi === undefined || pokusaj > ponovi.limit) {
                        throw greska
                    }
                    provjeri.equal(
                        ponovi.backoff,
                        'constant',
                        'Mehanizam izvršavanja ne smije ponovo množiti dinamičko odlaganje.',
                    )
                    provjeri.equal(typeof ponovi.delay, 'function')
                    if (typeof ponovi.delay !== 'function') throw new Error('Očekuje se dinamičko odlaganje.')
                    // Mehanizam izvršavanja ne garantuje očuvanje proizvoljnih svojstava prilagođene greške.
                    const odlaganje = await ponovi.delay({ ctx: kontekst, error: new Error(greska.message) })
                    if (typeof odlaganje === 'number') {
                        cekanja.push(odlaganje)
                    } else {
                        const sekunde = /^([0-9]+(?:\.[0-9]+)?) seconds?$/.exec(odlaganje)
                        provjeri.ok(sekunde !== null, 'Odlaganje mora biti trajanje u sekundama.')
                        cekanja.push(Number(sekunde[1]) * 1_000)
                    }
                }
            }
        },
        async sleep(naziv, trajanje) {
            await Promise.reject(new Error(`Ugrađeno ponavljanje ne koristi sleep: ${naziv}, ${trajanje}.`))
        },
        async sleepUntil() {
            await Promise.reject(new Error('Tok rada ne koristi sleepUntil.'))
        },
        async waitForEvent() {
            return await Promise.reject(new Error('Tok rada ne koristi waitForEvent.'))
        },
    }
    return { koraci, nazivi, cekanja, ponavljanja, greske }
}

function pripremac(ishod: IshodPripreme = { vrsta: 'poruka', tekst: 'Pripremljeni izvještaj' }): PripremacStatistike {
    return { pripremi: async () => await Promise.resolve(ishod) }
}

async function pokreniIsporuku(
    posao: TrajniPosao,
    tekst: string,
    koraci: KorakToka,
    isporuci: Isporuka,
): Promise<IshodIsporuke> {
    return posao.vrsta === 'statistika'
        ? await pokreniStatistiku(posao, koraci, pripremac({ vrsta: 'poruka', tekst }), isporuci)
        : await pokreniMotivaciju(posao, koraci, { generisi: async () => await Promise.resolve(tekst) }, isporuci)
}

function telegramGreska(status: number, odlaganje?: number): TelegramGreska {
    return new TelegramGreska(
        'Tajni sadržaj https://api.telegram.org/botTAJNI_TOKEN/sendMessage',
        {
            ok: false,
            error_code: status,
            description: 'Tajni sadržaj',
            parameters: odlaganje === undefined ? {} : { retry_after: odlaganje },
        },
        'sendMessage',
        { text: 'Privatni izvještaj' },
    )
}

await testiraj('statistički tok rada čuva pripremu i ponavlja samo isporuku istog sadržaja', async kontekst => {
    const { koraci, nazivi, cekanja, ponavljanja } = napraviKorake()
    const priprema = pripremac()
    const pripremi = kontekst.mock.method(priprema, 'pripremi')
    kontekst.mock.method(console, 'error', () => undefined)
    const isporuceniTekstovi: string[] = []
    const ishod = await pokreniStatistiku(posao, koraci, priprema, async (odrediste, tekst) => {
        provjeri.deepEqual(odrediste, { razgovorId: -123, nitId: 42 })
        isporuceniTekstovi.push(tekst)
        if (isporuceniTekstovi.length < 3) throw telegramGreska(503)
        await Promise.resolve()
    })

    provjeri.deepEqual(ishod, { vrsta: 'isporuceno' })
    provjeri.equal(pripremi.mock.callCount(), 1)
    provjeri.deepEqual(pripremi.mock.calls[0].arguments, [new Date(posao.trenutakIzvjestaja)])
    provjeri.deepEqual(isporuceniTekstovi, Array(3).fill('Pripremljeni izvještaj'))
    provjeri.deepEqual(nazivi, ['priprema-poruke', 'isporuka-poruke'])
    provjeri.deepEqual(cekanja, [1_000, 2_000])
    provjeri.deepEqual(ponavljanja, [0, 3])
})

for (const izvor of ['rucni', 'zakazani'] as const) {
    await testiraj(`motivacioni tok rada (${izvor}) ponavlja isporuku istog pripremljenog citata`, async kontekst => {
        const { koraci, nazivi, cekanja } = napraviKorake()
        kontekst.mock.method(console, 'error', () => undefined)
        const generator = { generisi: async () => await Promise.resolve('Sačuvani motivacioni citat.') }
        const generisi = kontekst.mock.method(generator, 'generisi')
        const odrediste = izvor === 'rucni' ? posao.odrediste : { razgovorId: -456 }
        const poruke: string[] = []

        const ishod = await pokreniMotivaciju(
            { ...posao, vrsta: 'motivacija', izvor, odrediste },
            koraci,
            generator,
            async (odredjenoOdrediste, tekst) => {
                provjeri.deepEqual(odredjenoOdrediste, odrediste)
                poruke.push(tekst)
                if (poruke.length === 1) throw telegramGreska(503)
                await Promise.resolve()
            },
        )

        provjeri.deepEqual(ishod, { vrsta: 'isporuceno' })
        provjeri.equal(generisi.mock.callCount(), 1)
        provjeri.deepEqual(poruke, ['Sačuvani motivacioni citat.', 'Sačuvani motivacioni citat.'])
        provjeri.deepEqual(nazivi, ['priprema-poruke', 'isporuka-poruke'])
        provjeri.deepEqual(cekanja, [1_000])
    })
}

await testiraj('svaki tok rada odbija posao druge vrste prije pripreme i isporuke', async kontekst => {
    const { koraci, nazivi } = napraviKorake()
    const priprema = pripremac()
    const pripremi = kontekst.mock.method(priprema, 'pripremi')
    const generator = { generisi: async () => await Promise.resolve('Ne treba pripremiti citat.') }
    const generisi = kontekst.mock.method(generator, 'generisi')
    const isporuci = kontekst.mock.fn(async () => {
        await Promise.reject(new Error('Isporuka ne smije početi'))
    })

    await provjeri.rejects(pokreniStatistiku({ ...posao, vrsta: 'motivacija' }, koraci, priprema, isporuci))
    await provjeri.rejects(pokreniMotivaciju(posao, koraci, generator, isporuci))

    provjeri.deepEqual(nazivi, [])
    provjeri.equal(pripremi.mock.callCount(), 0)
    provjeri.equal(generisi.mock.callCount(), 0)
    provjeri.equal(isporuci.mock.callCount(), 0)
})

for (const vrsta of ['statistika', 'motivacija'] as const) {
    await testiraj(`${vrsta}: neispravan Telegram retry_after koristi eksponencijalno čekanje`, async kontekst => {
        kontekst.mock.method(console, 'error', () => undefined)
        for (const odlaganje of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
            const { koraci, cekanja } = napraviKorake()
            await provjeri.rejects(
                pokreniIsporuku({ ...posao, vrsta }, 'Pripremljeni tekst.', koraci, async () => {
                    await Promise.reject(telegramGreska(429, odlaganje))
                }),
                /Telegram isporuka nije uspjela/,
            )
            provjeri.deepEqual(cekanja, [1_000, 2_000, 4_000])
        }
    })

    await testiraj(
        `${vrsta}: eksponencijalno čekanje ostaje minimum za kratki Telegram retry_after`,
        async kontekst => {
            const { koraci, cekanja } = napraviKorake()
            kontekst.mock.method(console, 'error', () => undefined)
            await provjeri.rejects(
                pokreniIsporuku({ ...posao, vrsta }, 'Pripremljeni tekst.', koraci, async () => {
                    await Promise.reject(telegramGreska(429, 1))
                }),
                /Telegram isporuka nije uspjela/,
            )
            provjeri.deepEqual(cekanja, [1_000, 2_000, 4_000])
        },
    )

    await testiraj(
        `${vrsta}: tok rada poštuje Telegram retry_after i završava poslije najviše tri ponavljanja`,
        async kontekst => {
            const { koraci, cekanja, greske } = napraviKorake()
            let pokusaji = 0
            kontekst.mock.method(console, 'error', () => undefined)
            await provjeri.rejects(
                pokreniIsporuku({ ...posao, vrsta }, 'Pripremljeni izvještaj', koraci, async () => {
                    pokusaji++
                    await Promise.reject(telegramGreska(429, 7))
                }),
                /Telegram isporuka nije uspjela/,
            )
            provjeri.equal(pokusaji, 4)
            provjeri.deepEqual(cekanja, [7_000, 7_000, 7_000])
            provjeri.ok(greske.every(greska => !(greska instanceof GreskaBezPonavljanja)))
            provjeri.ok(greske.every(greska => greska.cause === undefined))
            provjeri.doesNotMatch(
                greske.map(greska => greska.stack).join('\n'),
                /TAJNI_TOKEN|Privatni|Tajni sadržaj|api.telegram.org/,
            )
        },
    )

    for (const status of [400, 401, 403, 404]) {
        await testiraj(
            `${vrsta}: trajna Telegram greška ${status} zaustavlja isporuku odmah i bez tajnih zapisa`,
            async kontekst => {
                const { koraci, cekanja, greske } = napraviKorake()
                const zapisi = kontekst.mock.method(console, 'error', () => undefined)
                let pokusaji = 0
                await provjeri.rejects(
                    pokreniIsporuku({ ...posao, vrsta }, 'Pripremljeni izvještaj', koraci, async () => {
                        pokusaji++
                        await Promise.reject(telegramGreska(status))
                    }),
                    /Telegram isporuka nije uspjela/,
                )
                provjeri.equal(pokusaji, 1)
                provjeri.ok(greske[0] instanceof GreskaBezPonavljanja)
                provjeri.equal(greske[0].cause, undefined)
                provjeri.deepEqual(cekanja, [])
                const zapis = JSON.stringify(zapisi.mock.calls.map(poziv => poziv.arguments))
                provjeri.doesNotMatch(zapis, /TAJNI_TOKEN|Privatni|Tajni sadržaj|api.telegram.org/)
                provjeri.doesNotMatch(greske[0].stack ?? '', /TAJNI_TOKEN|Privatni|Tajni sadržaj|api.telegram.org/)
            },
        )
    }

    await testiraj(
        `${vrsta}: mrežni neuspjeh isporuke koristi ograničeno eksponencijalno odlaganje`,
        async kontekst => {
            const { koraci, cekanja, greske } = napraviKorake()
            kontekst.mock.method(console, 'error', () => undefined)
            await provjeri.rejects(
                pokreniIsporuku({ ...posao, vrsta }, 'Pripremljeni izvještaj', koraci, async () => {
                    await Promise.reject(new Error('Tajna mrežna greška'))
                }),
                /Telegram isporuka nije uspjela/,
            )
            provjeri.deepEqual(cekanja, [1_000, 2_000, 4_000])
            provjeri.equal(greske.length, 4)
            provjeri.ok(greske.every(greska => !(greska instanceof GreskaBezPonavljanja)))
            provjeri.ok(greske.every(greska => greska.cause === undefined))
            provjeri.doesNotMatch(greske.map(greska => greska.stack).join('\n'), /Tajna mrežna greška/)
        },
    )
}

for (const izvor of ['rucni', 'zakazani'] as const) {
    await testiraj(`nedostupna statistika čuva ponašanje za ${izvor} posao`, async () => {
        const { koraci, nazivi } = napraviKorake()
        const poruke: string[] = []
        const ishod = await pokreniStatistiku(
            { ...posao, izvor },
            koraci,
            pripremac({ vrsta: 'preskoceno', razlog: 'statistika-nedostupna' }),
            async (_posao, tekst) => {
                poruke.push(tekst)
                await Promise.resolve()
            },
        )
        provjeri.deepEqual(
            poruke,
            izvor === 'rucni' ? ['Statistika trenutno nije dostupna. Pokušaj ponovo kasnije.'] : [],
        )
        provjeri.equal(ishod.vrsta, izvor === 'rucni' ? 'isporuceno' : 'preskoceno')
        provjeri.deepEqual(nazivi, izvor === 'rucni' ? ['priprema-poruke', 'isporuka-poruke'] : ['priprema-poruke'])
    })

    await testiraj(`neuspjeh trajnog koraka pripreme čuva statistički ishod za ${izvor} posao`, async kontekst => {
        const zapisi = kontekst.mock.method(console, 'error', () => undefined)
        const { koraci: koraciSaGreskom } = napraviKorake(new Error('Istek koraka: TAJNI_TOKEN i Privatni izvještaj'))
        const poruke: string[] = []
        const ishod = await pokreniStatistiku(
            { ...posao, izvor },
            koraciSaGreskom,
            pripremac(),
            async (_posao, tekst) => {
                poruke.push(tekst)
                await Promise.resolve()
            },
        )
        provjeri.deepEqual(
            poruke,
            izvor === 'rucni' ? ['Statistika trenutno nije dostupna. Pokušaj ponovo kasnije.'] : [],
        )
        provjeri.equal(ishod.vrsta, izvor === 'rucni' ? 'isporuceno' : 'preskoceno')
        provjeri.doesNotMatch(
            JSON.stringify(zapisi.mock.calls.map(poziv => poziv.arguments)),
            /TAJNI_TOKEN|Privatni izvještaj/,
        )
    })
}

for (const izvorGreske of ['pripremac', 'trajni-korak']) {
    await testiraj(
        `neuspjeh motivacione pripreme (${izvorGreske}) prekida posao bez osjetljivih podataka`,
        async kontekst => {
            const { koraci } = napraviKorake()
            const zapisi = kontekst.mock.method(console, 'error', () => undefined)
            const koraciSaGreskom =
                izvorGreske === 'trajni-korak' ? napraviKorake(new Error('Istek koraka: TAJNI_TOKEN')).koraci : koraci
            const isporuci = kontekst.mock.fn(async () => {
                await Promise.reject(new Error('Isporuka ne smije početi'))
            })

            await provjeri.rejects(
                pokreniMotivaciju(
                    { ...posao, vrsta: 'motivacija' },
                    koraciSaGreskom,
                    {
                        generisi: async () => await Promise.reject(new Error('TAJNI_TOKEN')),
                    },
                    isporuci,
                ),
                { message: 'Priprema poruke nije uspjela.' },
            )
            provjeri.equal(isporuci.mock.callCount(), 0)
            provjeri.equal(zapisi.mock.callCount(), 1)
            provjeri.doesNotMatch(
                JSON.stringify(zapisi.mock.calls.map(poziv => poziv.arguments)),
                /TAJNI_TOKEN|Istek koraka/,
            )
        },
    )
}

await testiraj('Tok rada odbija neispravan ugovor prije pripreme ili isporuke', async () => {
    const { koraci, nazivi } = napraviKorake()
    await provjeri.rejects(
        pokreniStatistiku({ ...posao, trenutakIzvjestaja: 'sjutra' }, koraci, pripremac(), async () => {
            await Promise.reject(new Error('Isporuka ne smije početi'))
        }),
    )
    provjeri.deepEqual(nazivi, [])
})

for (const vrsta of ['statistika', 'motivacija'] as const) {
    await testiraj(`${vrsta}: nastavak koristi sadržaj sačuvan u koraku pripreme`, async kontekst => {
        const { koraci } = napraviKorake()
        const izvornoDo = koraci.do.bind(koraci)
        const priprema: IshodPripreme = { vrsta: 'poruka', tekst: 'Već sačuvani sadržaj.' }
        kontekst.mock.method(
            koraci,
            'do',
            async (
                naziv: string,
                opcije: KonfiguracijaKorakaToka,
                izvrsi: (kontekst: KontekstKorakaToka) => Promise<IshodPripreme | IshodIsporuke>,
            ) => (naziv === 'priprema-poruke' ? priprema : await izvornoDo(naziv, opcije, izvrsi)),
        )
        const generisi = kontekst.mock.fn(async () => await Promise.reject(new Error('Priprema je već završena.')))
        const poruke: string[] = []
        const isporuci: Isporuka = async (_odrediste, tekst) => {
            poruke.push(tekst)
            await Promise.resolve()
        }
        const ishod =
            vrsta === 'statistika'
                ? await pokreniStatistiku(posao, koraci, { pripremi: generisi }, isporuci)
                : await pokreniMotivaciju({ ...posao, vrsta }, koraci, { generisi }, isporuci)
        provjeri.deepEqual(ishod, { vrsta: 'isporuceno' })
        provjeri.equal(generisi.mock.callCount(), 0)
        provjeri.deepEqual(poruke, ['Već sačuvani sadržaj.'])
    })
}

await testiraj('trajno prihvatanje čeka stvaranje i zadržava oba ishoda 30 dana', async () => {
    const pozivi: unknown[] = []
    const vezivanje: VezivanjeToka = {
        async create(opcije) {
            pozivi.push(opcije)
            return await Promise.resolve({
                id: opcije.id,
                status: async () => await Promise.resolve({ status: 'queued' }),
            })
        },
        async get() {
            return await Promise.reject(new Error('Pronalaženje nije potrebno za novi posao'))
        },
    }
    provjeri.deepEqual(await prihvatiTok(vezivanje, 'test-123-update-1', posao), {
        id: 'test-123-update-1',
        duplikat: false,
    })
    provjeri.deepEqual(pozivi, [
        {
            id: 'test-123-update-1',
            params: posao,
            retention: { successRetention: '30 days', errorRetention: '30 days' },
        },
    ])
})

await testiraj('prihvatanje ostaje neriješeno dok stvaranje ne potvrdi trajni posao', async () => {
    let dovrsi: () => void = () => undefined
    const potvrda = new Promise<void>(razrijesi => {
        dovrsi = razrijesi
    })
    const vezivanje: VezivanjeToka = {
        async create({ id }) {
            await potvrda
            return { id, status: async () => await Promise.resolve({ status: 'queued' }) }
        },
        async get() {
            return await Promise.reject(new Error('Pronalaženje nije potrebno'))
        },
    }
    let prihvaceno = false
    const pokretanje = prihvatiTok(vezivanje, 'test-123-update-1', posao).then(ishod => {
        prihvaceno = true
        return ishod
    })
    await Promise.resolve()
    provjeri.equal(prihvaceno, false)
    dovrsi()
    await pokretanje
    provjeri.equal(prihvaceno, true)
})

await testiraj('postojeća potvrđena instanca je prihvaćen duplikat i nakon neizvjesne greške stvaranja', async () => {
    const vezivanje: VezivanjeToka = {
        async create() {
            return await Promise.reject(new Error('Prekinut odgovor poslije prihvatanja'))
        },
        async get(id) {
            return await Promise.resolve({ id, status: async () => await Promise.resolve({ status: 'complete' }) })
        },
    }
    provjeri.deepEqual(await prihvatiTok(vezivanje, 'test-123-update-1', posao), {
        id: 'test-123-update-1',
        duplikat: true,
    })
})

for (const stanje of ['unknown', 'neocekivano-stanje', 'greska-statusa', 'greska-pronalazenja']) {
    await testiraj(`nepotvrđeno prihvatanje ${stanje} se prosljeđuje kao bezbjedna greška`, async () => {
        const vezivanje: VezivanjeToka = {
            async create() {
                return await Promise.reject(new Error('Tajni zahtjev'))
            },
            async get(id) {
                await Promise.resolve()
                if (stanje === 'greska-pronalazenja') throw new Error('Tajno pronalaženje')
                return {
                    id,
                    async status() {
                        await Promise.resolve()
                        if (stanje === 'greska-statusa') throw new Error('Tajni status')
                        return { status: stanje }
                    },
                }
            },
        }
        await provjeri.rejects(prihvatiTok(vezivanje, 'test-123-update-1', posao), {
            message: 'Trajni posao nije prihvaćen.',
        })
    })
}
