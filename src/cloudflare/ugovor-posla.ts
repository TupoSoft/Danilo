import { DateTime as DatumIVrijeme } from 'luxon'
import { z as zod } from 'zod'
import { NULA, VREMENSKA_ZONA_IZVJESTAJA } from '../konstante.js'
import type { VrstaPosla } from '../poslovi.js'

const identifikatorRazgovora = zod
    .number()
    .int()
    .safe()
    .refine(broj => broj !== NULA, 'Razgovor mora imati identifikator.')

const identifikatorNiti = zod.number().int().safe().positive()

const semaOdredista = zod.object({ razgovorId: identifikatorRazgovora, nitId: identifikatorNiti.optional() }).strict()

const semaTrenutka = zod
    .string()
    .datetime({ message: 'Trenutak izvještaja mora biti ISO datum u UTC-u.' })
    .refine(tekst => Number.isFinite(Date.parse(tekst)), 'Trenutak izvještaja nije ispravan.')
    .transform(tekst => new Date(tekst).toISOString())

const semaPosla = zod
    .object({
        vrsta: zod.enum(['statistika', 'motivacija']),
        izvor: zod.enum(['rucni', 'zakazani']),
        odrediste: semaOdredista,
        trenutakIzvjestaja: semaTrenutka,
    })
    .strict()

const semaStatistickogPosla = semaPosla.extend({ vrsta: zod.literal('statistika') })
const semaMotivacionogPosla = semaPosla.extend({ vrsta: zod.literal('motivacija') })

export type TrajniPosao = zod.infer<typeof semaPosla>
export type StatistickiPosao = zod.infer<typeof semaStatistickogPosla>
export type MotivacioniPosao = zod.infer<typeof semaMotivacionogPosla>
export type OdredistePosla = TrajniPosao['odrediste']

export function parsirajPosao(ulaz: unknown): TrajniPosao {
    return semaPosla.parse(ulaz)
}

export function parsirajStatistickiPosao(ulaz: unknown): StatistickiPosao {
    return semaStatistickogPosla.parse(ulaz)
}

export function parsirajMotivacioniPosao(ulaz: unknown): MotivacioniPosao {
    return semaMotivacionogPosla.parse(ulaz)
}

// Ograničen ASCII opseg čuva jednoznačnost djelova i ograničenje dužine identifikatora toka rada.
const semaOkruzenja = zod.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, 'Naziv okruženja nije ispravan.')
const semaBota = zod.string().regex(/^[1-9][0-9]{0,19}$/, 'Identifikator bota nije ispravan.')

function opsegIdentifikatora(okruzenje: string, botId: string): string {
    return `${semaOkruzenja.parse(okruzenje)}-${semaBota.parse(botId)}`
}

export function idRucnogPosla(okruzenje: string, botId: string, updateId: number): string {
    const provjereniUpdateId = zod.number().int().safe().nonnegative().parse(updateId)
    return `${opsegIdentifikatora(okruzenje, botId)}-update-${provjereniUpdateId}`
}

export function idZakazanogPosla(okruzenje: string, botId: string, vrsta: VrstaPosla, trenutak: Date): string {
    const datum = DatumIVrijeme.fromJSDate(trenutak, { zone: VREMENSKA_ZONA_IZVJESTAJA }).toISODate()
    if (datum === null) throw new Error('Trenutak zakazanog posla nije ispravan.')
    return `${opsegIdentifikatora(okruzenje, botId)}-${vrsta}-${datum}`
}
