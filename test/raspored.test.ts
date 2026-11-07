import provjeri from 'node:assert/strict'
import { test as testiraj } from 'node:test'
import { CRON_MOTIVACIJE, CRON_STATISTIKE, zakazaniPosao } from '../src/cloudflare/raspored.js'

const odrediste = { razgovorId: -100123, nitId: 42 }
const dani = [
    { datum: '2026-01-15', motivacijaUTC: '11:00', statistikaUTC: '22:55' },
    { datum: '2026-07-15', motivacijaUTC: '10:00', statistikaUTC: '21:55' },
    { datum: '2026-03-28', motivacijaUTC: '11:00', statistikaUTC: '22:55' },
    { datum: '2026-03-29', motivacijaUTC: '10:00', statistikaUTC: '21:55' },
    { datum: '2026-10-24', motivacijaUTC: '10:00', statistikaUTC: '21:55' },
    { datum: '2026-10-25', motivacijaUTC: '11:00', statistikaUTC: '22:55' },
]

for (const { datum, motivacijaUTC, statistikaUTC } of dani) {
    void testiraj(`raspored ${datum} propušta samo podgoričkih 12:00 i 23:55`, () => {
        for (const [cron, vremena, ocekivano, vrsta] of [
            [CRON_MOTIVACIJE, ['10:00', '11:00'], motivacijaUTC, 'motivacija'],
            [CRON_STATISTIKE, ['21:55', '22:55'], statistikaUTC, 'statistika'],
        ] as const) {
            for (const vrijeme of vremena) {
                for (const sekunde of ['00.000', '00.001', '05.000', '58.123', '59.999']) {
                    const trenutakIzvjestaja = `${datum}T${vrijeme}:${sekunde}Z`
                    const posao = zakazaniPosao(cron, Date.parse(trenutakIzvjestaja), odrediste)
                    if (vrijeme === ocekivano) {
                        provjeri.deepEqual(
                            posao,
                            { vrsta, izvor: 'zakazani', odrediste, trenutakIzvjestaja },
                            trenutakIzvjestaja,
                        )
                    } else {
                        provjeri.equal(posao, undefined, trenutakIzvjestaja)
                    }
                }
            }

            const pocetakMinuta = Date.parse(`${datum}T${ocekivano}:00.000Z`)
            for (const pomak of [-1, 60_000]) {
                const trenutak = pocetakMinuta + pomak
                provjeri.equal(zakazaniPosao(cron, trenutak, odrediste), undefined, new Date(trenutak).toISOString())
            }
        }
    })
}

void testiraj('raspored odbija drugi cron, neispravan trenutak i vrijeme izvan ciljnog minuta', () => {
    for (const [cron, trenutak] of [
        ['* * * * *', Date.parse('2026-07-15T10:00:00.000Z')],
        [CRON_MOTIVACIJE, Number.NaN],
        [CRON_MOTIVACIJE, Number.POSITIVE_INFINITY],
        [CRON_MOTIVACIJE, Number.NEGATIVE_INFINITY],
        [CRON_STATISTIKE, Number.NaN],
        [CRON_STATISTIKE, Number.POSITIVE_INFINITY],
        [CRON_STATISTIKE, Number.NEGATIVE_INFINITY],
        [CRON_MOTIVACIJE, Date.parse('2026-07-15T10:01:00.000Z')],
        [CRON_STATISTIKE, Date.parse('2026-07-15T10:00:00.000Z')],
    ] as const) {
        provjeri.equal(zakazaniPosao(cron, trenutak, odrediste), undefined)
    }
})
