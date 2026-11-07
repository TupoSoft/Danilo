import provjeri from 'node:assert/strict'
import { test as testiraj } from 'node:test'
import { PripremaStatistike, type OpsegDnevnogPregleda, type PisacDnevnogPregleda } from '../src/priprema-statistike.js'

const trenutakIzvjestaja = new Date('2026-07-01T21:55:00.000Z')
const zaglavljeIzvjestaja = '<b>Dnevni pregled</b>\n<i>1. 7. 2026. · 00:00–23:55 (Europe/Podgorica)</i>\n\n'

await testiraj(
    'dnevna priprema predaje jedan fiksni opseg generatoru i vraća njegov šaljivi pregled',
    async kontekst => {
        const pisac: PisacDnevnogPregleda = {
            napisi: async () =>
                await Promise.resolve('Prijava je dobila provjere, a testovi razlog da nam kvare planove.'),
        }
        const napisi = kontekst.mock.method(pisac, 'napisi')

        const ishod = await new PripremaStatistike(pisac).pripremi(trenutakIzvjestaja)

        provjeri.deepEqual(ishod, {
            vrsta: 'poruka',
            tekst: `${zaglavljeIzvjestaja}Prijava je dobila provjere, a testovi razlog da nam kvare planove.`,
        })
        provjeri.deepEqual(
            napisi.mock.calls.map(poziv => poziv.arguments),
            [[{ od: '2026-06-30T22:00:00.000Z', doTrenutka: trenutakIzvjestaja.toISOString() }]],
        )
    },
)

await testiraj('priprema prosleđuje potvrđenu poruku generatora za dan bez komitova', async kontekst => {
    const tekst = 'Danas nema novih komitova. Git je odmarao, za ekipu nemamo dokaze.'
    const pisac: PisacDnevnogPregleda = { napisi: async () => await Promise.resolve(tekst) }
    const napisi = kontekst.mock.method(pisac, 'napisi')

    provjeri.deepEqual(await new PripremaStatistike(pisac).pripremi(trenutakIzvjestaja), {
        vrsta: 'poruka',
        tekst: `${zaglavljeIzvjestaja}${tekst}`,
    })
    provjeri.equal(napisi.mock.callCount(), 1)
})

await testiraj('opseg se određuje prije generisanja i ostaje isti kada obrada pređe ponoć', async kontekst => {
    const trenutak = new Date('2026-07-01T21:59:59.000Z')
    kontekst.mock.timers.enable({ apis: ['Date'], now: trenutak })
    const opsezi: OpsegDnevnogPregleda[] = []
    const priprema = new PripremaStatistike({
        napisi: async opseg => {
            kontekst.mock.timers.setTime(Date.parse('2026-07-01T22:01:00.000Z'))
            opsezi.push(opseg)

            return await Promise.resolve('Pregled prethodnog dana.')
        },
    })

    provjeri.deepEqual(await priprema.pripremi(), {
        vrsta: 'poruka',
        tekst: '<b>Dnevni pregled</b>\n<i>1. 7. 2026. · 00:00–23:59 (Europe/Podgorica)</i>\n\nPregled prethodnog dana.',
    })
    provjeri.deepEqual(opsezi, [{ od: '2026-06-30T22:00:00.000Z', doTrenutka: trenutak.toISOString() }])
})

for (const { trenutak, pocetakDana, datum } of [
    { trenutak: '2026-01-15T22:55:00.000Z', pocetakDana: '2026-01-14T23:00:00.000Z', datum: '15. 1. 2026.' },
    { trenutak: '2026-03-29T21:55:00.000Z', pocetakDana: '2026-03-28T23:00:00.000Z', datum: '29. 3. 2026.' },
    { trenutak: '2026-10-25T22:55:00.000Z', pocetakDana: '2026-10-24T22:00:00.000Z', datum: '25. 10. 2026.' },
    { trenutak: '2026-11-05T22:55:00.000Z', pocetakDana: '2026-11-04T23:00:00.000Z', datum: '5. 11. 2026.' },
]) {
    await testiraj(`odloženi pregled čuva trenutak ${trenutak} i odgovarajuću podgoričku ponoć`, async kontekst => {
        kontekst.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-04T10:00:00.000Z') })
        const pisac: PisacDnevnogPregleda = { napisi: async () => await Promise.resolve('Odloženi pregled.') }
        const napisi = kontekst.mock.method(pisac, 'napisi')

        provjeri.deepEqual(await new PripremaStatistike(pisac).pripremi(new Date(trenutak)), {
            vrsta: 'poruka',
            tekst: `<b>Dnevni pregled</b>\n<i>${datum} · 00:00–23:55 (Europe/Podgorica)</i>\n\nOdloženi pregled.`,
        })

        provjeri.deepEqual(
            napisi.mock.calls.map(poziv => poziv.arguments),
            [[{ od: pocetakDana, doTrenutka: trenutak }]],
        )
    })
}

await testiraj('ručni pregled prikazuje lokalni dio dana i čuva trenutak i kada ga pisac izmijeni', async () => {
    const trenutak = new Date('2026-11-05T09:17:00.000Z')
    const opsezi: OpsegDnevnogPregleda[] = []
    const priprema = new PripremaStatistike({
        napisi: async opseg => {
            opsezi.push(opseg)
            trenutak.setUTCDate(6)

            return await Promise.resolve('<b>Danilo</b> — Dobio je ljepše poruke.')
        },
    })

    provjeri.deepEqual(await priprema.pripremi(trenutak), {
        vrsta: 'poruka',
        tekst: '<b>Dnevni pregled</b>\n<i>5. 11. 2026. · 00:00–10:17 (Europe/Podgorica)</i>\n\n<b>Danilo</b> — Dobio je ljepše poruke.',
    })
    provjeri.deepEqual(opsezi, [{ od: '2026-11-04T23:00:00.000Z', doTrenutka: '2026-11-05T09:17:00.000Z' }])
})

await testiraj('zaglavlje ulazi u Telegram ograničenje dužine poruke', async kontekst => {
    const najveciPregled = 'x'.repeat(4_096 - zaglavljeIzvjestaja.length)
    const priprema = (tekst: string): PripremaStatistike =>
        new PripremaStatistike({ napisi: async () => await Promise.resolve(tekst) })
    kontekst.mock.method(console, 'error', () => undefined)

    provjeri.deepEqual(await priprema(najveciPregled).pripremi(trenutakIzvjestaja), {
        vrsta: 'poruka',
        tekst: `${zaglavljeIzvjestaja}${najveciPregled}`,
    })
    provjeri.deepEqual(await priprema(`${najveciPregled}x`).pripremi(trenutakIzvjestaja), {
        vrsta: 'preskoceno',
        razlog: 'statistika-nedostupna',
    })
})

for (const { naziv, greska, status } of [
    {
        naziv: 'greška servisa',
        greska: Object.assign(new Error('Authorization: Bearer secret-provider-token'), {
            status: 429,
            request: {
                headers: { authorization: 'secret-provider-token' },
                body: 'osjetljivi podaci organizacije',
            },
        }),
        status: 429,
    },
    {
        naziv: 'neuspješan MCP poziv',
        greska: new Error('Neuspješan MCP poziv sa osjetljivim podacima organizacije i secret-provider-token.'),
        status: undefined,
    },
]) {
    await testiraj(`${naziv} preskače pregled i bilježi samo bezbjedan status`, async kontekst => {
        const pisac: PisacDnevnogPregleda = { napisi: async () => await Promise.reject(greska) }
        const napisi = kontekst.mock.method(pisac, 'napisi')
        const greske = kontekst.mock.method(console, 'error', () => undefined)

        provjeri.deepEqual(await new PripremaStatistike(pisac).pripremi(trenutakIzvjestaja), {
            vrsta: 'preskoceno',
            razlog: 'statistika-nedostupna',
        })
        provjeri.equal(napisi.mock.callCount(), 1)
        provjeri.deepEqual(
            greske.mock.calls.map(poziv => poziv.arguments),
            [[{ dogadjaj: 'Dnevni pregled trenutno nije dostupan', status }]],
        )
        provjeri.doesNotMatch(
            JSON.stringify(greske.mock.calls.map(poziv => poziv.arguments)),
            /secret-provider-token|authorization|osjetljivi podaci|osjetljivim podacima|Neuspješan MCP poziv/,
        )
    })
}

await testiraj('neispravan trenutak preskače pregled prije poziva generatora', async kontekst => {
    const pisac: PisacDnevnogPregleda = {
        napisi: async () => await Promise.reject(new Error('Neispravan opseg ne smije stići do modela.')),
    }
    const napisi = kontekst.mock.method(pisac, 'napisi')
    kontekst.mock.method(console, 'error', () => undefined)

    provjeri.deepEqual(await new PripremaStatistike(pisac).pripremi(new Date('nije-datum')), {
        vrsta: 'preskoceno',
        razlog: 'statistika-nedostupna',
    })
    provjeri.equal(napisi.mock.callCount(), 0)
})
