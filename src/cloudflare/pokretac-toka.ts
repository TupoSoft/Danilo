import { parsirajPosao, type TrajniPosao } from './ugovor-posla.js'

interface InstancaToka {
    id: string
    status: () => Promise<{ status: string }>
}

// Uži oblik vezivanja omogućava provjeru prihvatanja bez Cloudflare mreže.
export interface VezivanjeToka {
    create: (opcije: {
        id: string
        params: TrajniPosao
        retention: { successRetention: '30 days'; errorRetention: '30 days' }
    }) => Promise<InstancaToka>
    get: (id: string) => Promise<InstancaToka>
}

export interface PrihvaceniPosao {
    id: string
    duplikat: boolean
}

const POTVRDJENA_STANJA = new Set([
    'queued',
    'running',
    'paused',
    'errored',
    'terminated',
    'complete',
    'waiting',
    'waitingForPause',
])

export async function prihvatiTok(vezivanje: VezivanjeToka, id: string, ulaz: unknown): Promise<PrihvaceniPosao> {
    const posao = parsirajPosao(ulaz)

    try {
        await vezivanje.create({
            id,
            params: posao,
            retention: { successRetention: '30 days', errorRetention: '30 days' },
        })

        return { id, duplikat: false }
    } catch {
        try {
            const instanca = await vezivanje.get(id)
            // Dobijanje ručice samo po sebi ne potvrđuje da instanca postoji.
            const stanje = await instanca.status()
            if (instanca.id !== id || !POTVRDJENA_STANJA.has(stanje.status)) throw new Error('Instanca nije potvrđena.')
            return { id, duplikat: true }
        } catch {
            // SDK greške mogu sadržati osjetljive zahtjeve. Ne prenosi ih u zapis ili odgovor.
            throw new Error('Trajni posao nije prihvaćen.')
        }
    }
}
