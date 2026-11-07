import { DateTime as DatumIVrijeme } from 'luxon'
import { VREMENSKA_ZONA_IZVJESTAJA } from './konstante.js'
import { pocetakDanaISO } from './pomocno/datum.js'
import type { IshodPripreme } from './poslovi.js'

const NAJVISE_ZNAKOVA_PORUKE = 4_096

export interface OpsegDnevnogPregleda {
    od: string
    doTrenutka: string
}

export interface PisacDnevnogPregleda {
    napisi: (opseg: OpsegDnevnogPregleda) => Promise<string>
}

export class PripremaStatistike {
    constructor(private readonly pisac: PisacDnevnogPregleda) {}

    async pripremi(trenutak: Date = new Date()): Promise<IshodPripreme> {
        try {
            const od = pocetakDanaISO(trenutak)
            const doTrenutka = trenutak.toISOString()
            const lokalniTrenutak = DatumIVrijeme.fromISO(doTrenutka, { zone: VREMENSKA_ZONA_IZVJESTAJA })
            const zaglavlje = `<b>Dnevni pregled</b>\n<i>${lokalniTrenutak.toFormat('d. M. yyyy.')} · 00:00–${lokalniTrenutak.toFormat('HH:mm')} (${VREMENSKA_ZONA_IZVJESTAJA})</i>`
            const pregled = await this.pisac.napisi({ od, doTrenutka })
            const tekst = `${zaglavlje}\n\n${pregled}`

            if (tekst.length > NAJVISE_ZNAKOVA_PORUKE) {
                throw new Error('Dnevni pregled sa zaglavljem je predugačak za slanje.')
            }

            return { vrsta: 'poruka', tekst }
        } catch (greska) {
            const status =
                typeof greska === 'object' && greska !== null && 'status' in greska && typeof greska.status === 'number'
                    ? greska.status
                    : undefined

            console.error({ dogadjaj: 'Dnevni pregled trenutno nije dostupan', status })

            return { vrsta: 'preskoceno', razlog: 'statistika-nedostupna' }
        }
    }
}
