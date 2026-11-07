import type { Organizacija } from './organizacija.js'
import { NULA } from '../konstante.js'

const BROJ_PARALELNIH_GRANA = 4

export class BrojacKomitova {
    constructor(private readonly organizacija: Organizacija) {}

    async prebrojKomitove(autor?: string, od?: string, doTrenutka?: string): Promise<number> {
        let brojKomitova = NULA

        const repozitorijumi = await this.organizacija.dohvatiRepozitorijume()

        // Octokit učitava stranice jedne grane redom. Ograničavamo broj istovremenih
        // paginacija, a svaki repozitorijum zadržava svoj skup SHA vrijednosti.
        for (const repozitorijum of repozitorijumi) {
            const grane = await repozitorijum.dohvatiGrane()

            const jedinstveneShaVrijednosti = new Set<string>()

            for (let indeks = NULA; indeks < grane.length; indeks += BROJ_PARALELNIH_GRANA) {
                const komitovi = await Promise.all(
                    grane
                        .slice(indeks, indeks + BROJ_PARALELNIH_GRANA)
                        .map(async grana => await grana.dohvatiKomitove(autor, od, doTrenutka)),
                )

                for (const komit of komitovi.flat()) jedinstveneShaVrijednosti.add(komit.sha)
            }

            brojKomitova += jedinstveneShaVrijednosti.size
        }

        return brojKomitova
    }
}
