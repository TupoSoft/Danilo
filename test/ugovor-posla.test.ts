import provjeri from 'node:assert/strict'
import { test as testiraj } from 'node:test'
import {
    idRucnogPosla,
    idZakazanogPosla,
    parsirajPosao,
    parsirajStatistickiPosao,
    parsirajMotivacioniPosao,
} from '../src/cloudflare/ugovor-posla.js'

const posao = {
    vrsta: 'statistika',
    izvor: 'rucni',
    odrediste: { razgovorId: -100123, nitId: 42 },
    trenutakIzvjestaja: '2026-07-15T21:55:00.000Z',
}

void testiraj('trajni posao čuva vrstu, izvor, razgovor, nit i fiksnu referencu kroz JSON', () => {
    provjeri.deepEqual(parsirajPosao(JSON.parse(JSON.stringify(posao))), posao)
    provjeri.deepEqual(parsirajPosao({ ...posao, odrediste: { razgovorId: 123 } }).odrediste, { razgovorId: 123 })
    provjeri.equal(
        parsirajPosao({ ...posao, trenutakIzvjestaja: '2026-07-15T21:55:00Z' }).trenutakIzvjestaja,
        posao.trenutakIzvjestaja,
    )
})

void testiraj('zasebni ugovori tokova rada prihvataju samo svoju vrstu posla', () => {
    const motivacija = { ...posao, vrsta: 'motivacija' }
    provjeri.deepEqual(parsirajStatistickiPosao(posao), posao)
    provjeri.deepEqual(parsirajMotivacioniPosao(motivacija), motivacija)
    provjeri.throws(() => parsirajStatistickiPosao(motivacija))
    provjeri.throws(() => parsirajMotivacioniPosao(posao))
})

void testiraj('ugovor odbija nepoznate vrste, izvore, polja i neispravne identifikatore ili vrijeme', () => {
    for (const ulaz of [
        undefined,
        null,
        { ...posao, vrsta: 'nepoznato' },
        { ...posao, izvor: 'nepoznato' },
        { ...posao, tajna: 'ne pripada poslu' },
        { ...posao, odrediste: { razgovorId: '-100123' } },
        { ...posao, odrediste: { razgovorId: 0 } },
        { ...posao, odrediste: { razgovorId: 1.5 } },
        { ...posao, odrediste: { razgovorId: Number.MAX_SAFE_INTEGER + 1 } },
        { ...posao, odrediste: { razgovorId: -123, nitId: 0 } },
        { ...posao, odrediste: { razgovorId: -123, nitId: -42 } },
        { ...posao, odrediste: { razgovorId: -123, token: 'ne pripada poslu' } },
        { ...posao, trenutakIzvjestaja: '2026-07-15' },
        { ...posao, trenutakIzvjestaja: '2026-02-30T21:55:00.000Z' },
        { ...posao, trenutakIzvjestaja: '2026-07-15T23:55:00+02:00' },
    ]) {
        provjeri.throws(() => parsirajPosao(ulaz))
    }
})

void testiraj('ručni ID ponavlja novost samo u istom okruženju i za istog bota', () => {
    const identifikator = idRucnogPosla('produkcija', '123456', 987)
    provjeri.equal(idRucnogPosla('produkcija', '123456', 987), identifikator)
    provjeri.notEqual(idRucnogPosla('probno', '123456', 987), identifikator)
    provjeri.notEqual(idRucnogPosla('produkcija', '654321', 987), identifikator)
    provjeri.notEqual(idRucnogPosla('produkcija', '123456', 988), identifikator)
    provjeri.match(identifikator, /^[a-zA-Z0-9_-]+$/)
    provjeri.throws(() => idRucnogPosla('loše', '123456', 987))
    provjeri.throws(() => idRucnogPosla('produkcija', '123:token', 987))
    provjeri.throws(() => idRucnogPosla('produkcija', '123456', -1))
    provjeri.throws(() => idRucnogPosla('produkcija', '123456', 1.5))
})

void testiraj('zakazani ID uključuje akciju i lokalni datum Podgorice', () => {
    const trenutak = new Date('2026-07-14T22:30:00.000Z')
    const identifikator = idZakazanogPosla('produkcija', '123456', 'statistika', trenutak)
    provjeri.equal(identifikator, 'produkcija-123456-statistika-2026-07-15')
    provjeri.equal(
        idZakazanogPosla('produkcija', '123456', 'statistika', new Date('2026-07-15T21:55:00.000Z')),
        identifikator,
    )
    provjeri.notEqual(idZakazanogPosla('produkcija', '123456', 'motivacija', trenutak), identifikator)
    provjeri.notEqual(idZakazanogPosla('probno', '123456', 'statistika', trenutak), identifikator)
    provjeri.notEqual(idZakazanogPosla('produkcija', '654321', 'statistika', trenutak), identifikator)
    provjeri.throws(() => idZakazanogPosla('produkcija', '123456', 'statistika', new Date(Number.NaN)))
})
