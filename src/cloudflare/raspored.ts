import { DateTime as DatumIVrijeme } from 'luxon'
import { NULA, VREMENSKA_ZONA_IZVJESTAJA } from '../konstante.js'
import { parsirajPosao, type OdredistePosla, type TrajniPosao } from './ugovor-posla.js'

import { CRON_MOTIVACIJE, CRON_STATISTIKE } from './cron.js'
export { CRON_MOTIVACIJE, CRON_STATISTIKE } from './cron.js'
const SAT_MOTIVACIJE = 12
const SAT_STATISTIKE = 23
const MINUT_STATISTIKE = 55

export function zakazaniPosao(cron: string, scheduledTime: number, odrediste: OdredistePosla): TrajniPosao | undefined {
    const trenutak = DatumIVrijeme.fromMillis(scheduledTime, { zone: VREMENSKA_ZONA_IZVJESTAJA })
    if (!trenutak.isValid) return undefined

    // Raspored određuje minut; scheduledTime može sadržati sekunde i milisekunde.
    const motivacija = cron === CRON_MOTIVACIJE && trenutak.hour === SAT_MOTIVACIJE && trenutak.minute === NULA
    const statistika =
        cron === CRON_STATISTIKE && trenutak.hour === SAT_STATISTIKE && trenutak.minute === MINUT_STATISTIKE
    if (!motivacija && !statistika) return undefined

    // Referenca je planirani trenutak: kašnjenje rasporeda ili toka rada ne mijenja opseg izvještaja.
    return parsirajPosao({
        vrsta: motivacija ? 'motivacija' : 'statistika',
        izvor: 'zakazani',
        odrediste,
        trenutakIzvjestaja: new Date(scheduledTime).toISOString(),
    })
}
