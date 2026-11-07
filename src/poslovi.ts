export type VrstaPosla = 'statistika' | 'motivacija'

// Odgovor ostaje vezan za izvorni Telegram kontekst, uključujući nit i webhook odgovor.
export type OdgovorNaKomandu = (tekst: string) => Promise<unknown>

export interface ZahtjevZaPosao {
    vrsta: VrstaPosla
    odgovor?: OdgovorNaKomandu
}

export interface PreskocenaIsporuka {
    vrsta: 'preskoceno'
    razlog: 'statistika-nedostupna'
}

export type IshodPripreme = { vrsta: 'poruka'; tekst: string } | PreskocenaIsporuka
export type IshodIsporuke = { vrsta: 'isporuceno' } | PreskocenaIsporuka
export type IshodPokretanja = IshodIsporuke | { vrsta: 'prihvaceno' }

export interface PokretacPoslova {
    pokreni: (zahtjev: ZahtjevZaPosao) => Promise<IshodPokretanja>
}
