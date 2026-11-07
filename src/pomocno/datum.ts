import { DateTime as DatumIVrijeme } from 'luxon'
import { VREMENSKA_ZONA_IZVJESTAJA } from '../konstante.js'

export function pocetakDanaISO(trenutak: Date = new Date()): string {
    return DatumIVrijeme.fromJSDate(trenutak, { zone: VREMENSKA_ZONA_IZVJESTAJA })
        .startOf('day')
        .toJSDate()
        .toISOString()
}
