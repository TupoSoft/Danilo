import { readFileSync as procitajDatoteku } from 'node:fs'
import { readdir as procitajDirektorijum } from 'node:fs/promises'
import { registerHooks as registrujUcitavanje } from 'node:module'

// Oponaša Vite ?raw uvoze u Node pokretaču testova.
registrujUcitavanje({
    load(putanja, kontekst, ucitajDalje) {
        if (!putanja.endsWith('.md?raw')) return ucitajDalje(putanja, kontekst)

        const datoteka = new URL(putanja)
        datoteka.search = ''
        const sadrzaj = procitajDatoteku(datoteka, 'utf8')

        return { format: 'module', shortCircuit: true, source: `export default ${JSON.stringify(sadrzaj)}` }
    },
})

// Zaobilazi probleme pri ucitavanju modula u potprocesima sa postojecom verzijom ts-node-a.
const direktorijum = new URL('./', import.meta.url)
const datotekeTestova = (await procitajDirektorijum(direktorijum))
    .filter(datoteka => datoteka.endsWith('.test.ts'))
    .sort()

for (const datoteka of datotekeTestova) {
    await import(new URL(datoteka, direktorijum).href)
}
