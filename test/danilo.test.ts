import provjeri from 'node:assert/strict'
import { test as testiraj, type Mock as Zamjena, type TestContext as KontekstTesta } from 'node:test'
import { Bot } from 'grammy'
import { Danilo } from '../src/danilo.js'
import type { PokretacPoslova } from '../src/poslovi.js'

interface PostavkaBota {
    pokreni: Zamjena<PokretacPoslova['pokreni']>
    odgovori: unknown[]
    izvrsiKomandu: (tekst?: string, idKorisnika?: number, idNiti?: number) => Promise<void>
}

function pripremiBota(kontekst: KontekstTesta): PostavkaBota {
    const odgovori: unknown[] = []
    const bot = new Bot('123:test-token', {
        botInfo: {
            id: 123,
            is_bot: true,
            first_name: 'Danilo',
            username: 'danilo_test_bot',
            can_join_groups: true,
            can_read_all_group_messages: false,
            supports_inline_queries: false,
            can_connect_to_business: false,
            has_main_web_app: false,
        },
        client: { canUseWebhookReply: () => true },
    })
    kontekst.mock.method(globalThis, 'fetch', async () => await Promise.reject(new Error('Neočekivan mrežni zahtjev.')))
    const pokretac: PokretacPoslova = {
        async pokreni() {
            return await Promise.resolve({ vrsta: 'prihvaceno' })
        },
    }
    const pokreni = kontekst.mock.method(pokretac, 'pokreni')
    const danilo = new Danilo(bot, [123], pokretac)
    danilo.registrujKomande()

    return {
        pokreni,
        odgovori,
        async izvrsiKomandu(tekst = '/stats', idKorisnika = 123, idNiti?: number) {
            await bot.handleUpdate(
                {
                    update_id: 1,
                    message: {
                        message_id: 1,
                        message_thread_id: idNiti,
                        date: 0,
                        from: { id: idKorisnika, is_bot: false, first_name: 'Admin' },
                        chat: { id: -123, type: 'supergroup', title: 'Test' },
                        text: tekst,
                        entities: tekst.startsWith('/')
                            ? [{ type: 'bot_command', offset: 0, length: tekst.length }]
                            : [],
                    },
                },
                {
                    send: async tijelo => {
                        const sadrzaj: unknown = JSON.parse(tijelo)
                        odgovori.push(sadrzaj)
                        await Promise.resolve()
                    },
                },
            )
        },
    }
}

for (const [komanda, vrsta, nit] of [
    ['/stats', 'statistika', 42],
    ['/motivate', 'motivacija', 73],
    ['/stats', 'statistika', undefined],
] as const) {
    void testiraj(
        `${komanda} prosljeđuje vrstu posla i odgovara ${nit === undefined ? 'bez niti' : `u izvornoj niti ${nit}`}`,
        async kontekst => {
            const postavka = pripremiBota(kontekst)
            postavka.pokreni.mock.mockImplementation(async ({ odgovor }) => {
                provjeri.ok(odgovor !== undefined)
                await odgovor('Probni odgovor.')
                return { vrsta: 'prihvaceno' }
            })

            await postavka.izvrsiKomandu(komanda, 123, nit)

            provjeri.equal(postavka.pokreni.mock.callCount(), 1)
            provjeri.equal(postavka.pokreni.mock.calls[0].arguments[0].vrsta, vrsta)
            provjeri.deepEqual(postavka.odgovori, [
                {
                    method: 'sendMessage',
                    chat_id: -123,
                    text: 'Probni odgovor.',
                    ...(nit === undefined ? {} : { message_thread_id: nit }),
                },
            ])
        },
    )
}

for (const tekst of ['/start', '/stats', '/motivate', '/poop', 'Obična poruka.']) {
    void testiraj(`administrator je obavezan prije obrade poruke ${tekst}`, async kontekst => {
        const postavka = pripremiBota(kontekst)
        kontekst.mock.method(console, 'log', () => undefined)

        await postavka.izvrsiKomandu(tekst, 321)

        provjeri.deepEqual(postavka.odgovori, [
            { method: 'sendMessage', chat_id: -123, text: 'Ovo je Crna Gora, ođe se ne radi \u{1F61C}' },
        ])
        provjeri.equal(postavka.pokreni.mock.callCount(), 0)
    })
}

void testiraj('/start zadržava pozdrav, a /poop reakciju bez pokretanja poslova', async kontekst => {
    const postavka = pripremiBota(kontekst)

    await postavka.izvrsiKomandu('/start')
    await postavka.izvrsiKomandu('/poop')

    provjeri.deepEqual(postavka.odgovori, [
        { method: 'sendMessage', chat_id: -123, text: 'Ćao Admin! Ovo je Crna Gora, ođe se ne radi \u{1F61C}' },
        {
            method: 'setMessageReaction',
            chat_id: -123,
            message_id: 1,
            reaction: [{ type: 'emoji', emoji: '\u{1F4A9}' }],
        },
    ])
    provjeri.equal(postavka.pokreni.mock.callCount(), 0)
})

for (const tekst of ['LoTusFlare', 'TENDERLY', 'playtronix', 'IndIa']) {
    void testiraj(`bot ignoriše poruku ${tekst} bez odgovora i pokretanja poslova`, async kontekst => {
        const postavka = pripremiBota(kontekst)

        await postavka.izvrsiKomandu(tekst)

        provjeri.deepEqual(postavka.odgovori, [])
        provjeri.equal(postavka.pokreni.mock.callCount(), 0)
    })
}

void testiraj('neuspjeh pokretanja posla prosljeđuje se pozivaocu bez odgovora o uspjehu', async kontekst => {
    const postavka = pripremiBota(kontekst)
    postavka.pokreni.mock.mockImplementation(
        async () => await Promise.reject(new Error('Prihvatanje posla nije uspjelo.')),
    )

    await provjeri.rejects(postavka.izvrsiKomandu(), /Prihvatanje posla nije uspjelo/)

    provjeri.deepEqual(postavka.odgovori, [])
})
