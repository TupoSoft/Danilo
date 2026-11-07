import provjeri from 'node:assert/strict'
import { test as testiraj } from 'node:test'
import { Octokit as GitHubKlijent } from '@octokit/rest'
import { Grana } from '../src/github/grana.js'
import { BrojacKomitova } from '../src/github/brojac-komitova.js'
import { Organizacija } from '../src/github/organizacija.js'
import { Repozitorijum } from '../src/github/repozitorijum.js'

interface Stranica {
    podaci: unknown
    status?: number
    sljedeca?: URL
}

function pripremiGitHub(odgovori: (adresa: URL) => Stranica | Promise<Stranica>): {
    gitHubKlijent: GitHubKlijent
    zahtjevi: URL[]
    greske: unknown[]
} {
    const zahtjevi: URL[] = []
    const greske: unknown[] = []
    const dohvati: typeof globalThis.fetch = async ulaz => {
        const adresa = new URL(ulaz instanceof Request ? ulaz.url : ulaz)
        zahtjevi.push(adresa)
        const stranica = await odgovori(adresa)
        const zaglavlja = new Headers({ 'content-type': 'application/json' })
        if (stranica.sljedeca !== undefined) zaglavlja.set('link', `<${stranica.sljedeca.href}>; rel="next"`)

        return await Promise.resolve(
            new Response(JSON.stringify(stranica.podaci), { status: stranica.status ?? 200, headers: zaglavlja }),
        )
    }
    const zanemariDnevnik = (): void => undefined
    const gitHubKlijent = new GitHubKlijent({
        request: { fetch: dohvati },
        log: { debug: zanemariDnevnik, info: zanemariDnevnik, warn: zanemariDnevnik, error: zanemariDnevnik },
    })
    gitHubKlijent.hook.error('request', greska => {
        greske.push(greska)
        throw greska
    })

    return { gitHubKlijent, zahtjevi, greske }
}

function sljedecaStranica(adresa: URL): URL {
    const sljedeca = new URL(adresa)
    sljedeca.searchParams.set('page', '2')
    return sljedeca
}

function podijeliNaStranice(adresa: URL, prva: unknown[], druga: unknown[]): Stranica {
    provjeri.equal(adresa.searchParams.get('per_page'), '100')
    return adresa.searchParams.get('page') === '2'
        ? { podaci: druga }
        : { podaci: prva, sljedeca: sljedecaStranica(adresa) }
}

const pocetak = '2026-03-28T23:00:00.000Z'
const kraj = '2026-03-29T22:00:00.000Z'

function provjeriFiltereKomitova(adresa: URL): void {
    provjeri.equal(adresa.searchParams.get('author'), 'alice')
    provjeri.equal(adresa.searchParams.get('since'), pocetak)
    provjeri.equal(adresa.searchParams.get('until'), kraj)
}

await testiraj('clanovi organizacije se ucitavaju sa svih stranica i kada ih ima vise od 100', async () => {
    const postavka = pripremiGitHub(adresa => {
        provjeri.equal(adresa.pathname, '/orgs/acme/members')
        return podijeliNaStranice(
            adresa,
            Array.from({ length: 100 }, (_, indeks) => ({ login: `member-${indeks}` })),
            [{ login: 'member-100' }],
        )
    })

    const clanovi = await new Organizacija('acme', postavka.gitHubKlijent).dohvatiClanove()

    provjeri.deepEqual(
        clanovi,
        Array.from({ length: 101 }, (_, indeks) => `member-${indeks}`),
    )
    provjeri.equal(postavka.zahtjevi.length, 2)
})

await testiraj(
    'repozitorijumi organizacije se ucitavaju i sa kasnijih stranica i zadrzavaju svoj identitet',
    async () => {
        const postavka = pripremiGitHub(adresa => {
            if (adresa.pathname === '/orgs/acme/repos') {
                return podijeliNaStranice(
                    adresa,
                    Array.from({ length: 100 }, (_, indeks) => ({ name: `repo-${indeks}` })),
                    [{ name: 'repo-100' }],
                )
            }

            provjeri.equal(adresa.pathname, '/repos/acme/repo-100/branches')
            return { podaci: [] }
        })
        const repozitorijumi = await new Organizacija('acme', postavka.gitHubKlijent).dohvatiRepozitorijume()

        provjeri.equal(repozitorijumi.length, 101)
        const posljednjiRepozitorijum = repozitorijumi.at(-1)
        provjeri.ok(posljednjiRepozitorijum !== undefined)
        await posljednjiRepozitorijum.dohvatiGrane()
        provjeri.equal(postavka.zahtjevi.length, 3)
    },
)

await testiraj('grane repozitorijuma se ucitavaju i sa kasnijih stranica i zadrzavaju svoj identitet', async () => {
    const postavka = pripremiGitHub(adresa => {
        if (adresa.pathname === '/repos/acme/project/branches') {
            return podijeliNaStranice(
                adresa,
                Array.from({ length: 100 }, (_, indeks) => ({ name: `branch-${indeks}` })),
                [{ name: 'feature/work' }],
            )
        }

        provjeri.equal(adresa.pathname, '/repos/acme/project/commits')
        provjeri.equal(adresa.searchParams.get('sha'), 'feature/work')
        return { podaci: [] }
    })
    const grane = await new Repozitorijum('project', 'acme', postavka.gitHubKlijent).dohvatiGrane()

    provjeri.equal(grane.length, 101)
    const posljednjaGrana = grane.at(-1)
    provjeri.ok(posljednjaGrana !== undefined)
    await posljednjaGrana.dohvatiKomitove()
    provjeri.equal(postavka.zahtjevi.length, 3)
})

await testiraj('komitovi grane se ucitavaju i sa kasnijih stranica uz zadrzavanje svih filtera', async () => {
    const postavka = pripremiGitHub(adresa => {
        provjeri.equal(adresa.pathname, '/repos/acme/project/commits')
        provjeri.equal(adresa.searchParams.get('sha'), 'feature/work')
        provjeriFiltereKomitova(adresa)
        return podijeliNaStranice(
            adresa,
            Array.from({ length: 100 }, (_, indeks) => ({ sha: `sha-${indeks}` })),
            [{ sha: 'sha-100' }],
        )
    })

    const komitovi = await new Grana('feature/work', 'project', 'acme', postavka.gitHubKlijent).dohvatiKomitove(
        'alice',
        pocetak,
        kraj,
    )

    provjeri.deepEqual(
        komitovi,
        Array.from({ length: 101 }, (_, indeks) => ({ sha: `sha-${indeks}` })),
    )
    provjeri.equal(postavka.zahtjevi.length, 2)
})

await testiraj(
    'brojac uklanja ponovljene SHA vrijednosti unutar repozitorijuma kroz stavke, stranice i grane, pa sabira rezultate repozitorijuma',
    async () => {
        const postavka = pripremiGitHub(adresa => {
            if (adresa.pathname === '/orgs/acme/repos') {
                return { podaci: [{ name: 'one' }, { name: 'two' }, { name: 'empty' }] }
            }
            if (adresa.pathname === '/repos/acme/one/branches') {
                return { podaci: [{ name: 'main' }, { name: 'feature' }] }
            }
            if (adresa.pathname === '/repos/acme/two/branches') return { podaci: [{ name: 'main' }] }
            if (adresa.pathname === '/repos/acme/empty/branches') return { podaci: [] }

            provjeriFiltereKomitova(adresa)
            provjeri.equal(adresa.searchParams.get('per_page'), '100')
            if (adresa.pathname === '/repos/acme/one/commits') {
                if (adresa.searchParams.get('sha') === 'main') {
                    return podijeliNaStranice(
                        adresa,
                        Array.from({ length: 100 }, () => ({ sha: 'shared' })),
                        [{ sha: 'shared' }, { sha: 'later-page' }],
                    )
                }
                provjeri.equal(adresa.searchParams.get('sha'), 'feature')
                return { podaci: [{ sha: 'shared' }, { sha: 'feature-only' }] }
            }

            provjeri.equal(adresa.pathname, '/repos/acme/two/commits')
            provjeri.equal(adresa.searchParams.get('sha'), 'main')
            return { podaci: [{ sha: 'shared' }] }
        })

        const brojKomitova = await new BrojacKomitova(new Organizacija('acme', postavka.gitHubKlijent)).prebrojKomitove(
            'alice',
            pocetak,
            kraj,
        )

        provjeri.equal(brojKomitova, 4)
        provjeri.equal(postavka.zahtjevi.filter(adresa => adresa.pathname.endsWith('/commits')).length, 4)
    },
)

await testiraj('uspjesni prazni odgovori ostaju ispravni prazni rezultati sa nula komitova', async () => {
    const postavka = pripremiGitHub(() => ({ podaci: [] }))
    const organizacija = new Organizacija('acme', postavka.gitHubKlijent)

    provjeri.deepEqual(await organizacija.dohvatiClanove(), [])
    provjeri.deepEqual(await organizacija.dohvatiRepozitorijume(), [])
    provjeri.deepEqual(await new Repozitorijum('project', 'acme', postavka.gitHubKlijent).dohvatiGrane(), [])
    provjeri.deepEqual(await new Grana('main', 'project', 'acme', postavka.gitHubKlijent).dohvatiKomitove(), [])
    provjeri.equal(await new BrojacKomitova(organizacija).prebrojKomitove(), 0)
})

const naziviResursa = {
    clanovi: 'clanovi',
    repozitorijumi: 'repozitorijumi',
    grane: 'grane',
    komitovi: 'komitovi',
}

for (const resurs of ['clanovi', 'repozitorijumi', 'grane', 'komitovi'] as const) {
    await testiraj(
        `${naziviResursa[resurs]}: greska na kasnijoj stranici se prosljedjuje bez vracanja djelimicnih podataka`,
        async () => {
            const postavka = pripremiGitHub(adresa => {
                provjeri.equal(adresa.searchParams.get('per_page'), '100')
                if (adresa.searchParams.get('page') === '2') {
                    return { status: 503, podaci: { message: 'greska na kasnijoj stranici' } }
                }
                return {
                    podaci: Array.from({ length: 100 }, () => ({ login: 'alice', name: 'main', sha: 'shared' })),
                    sljedeca: sljedecaStranica(adresa),
                }
            })
            const organizacija = new Organizacija('acme', postavka.gitHubKlijent)
            const operacije: Record<typeof resurs, () => Promise<unknown>> = {
                clanovi: async () => await organizacija.dohvatiClanove(),
                repozitorijumi: async () => await organizacija.dohvatiRepozitorijume(),
                grane: async () => await new Repozitorijum('project', 'acme', postavka.gitHubKlijent).dohvatiGrane(),
                komitovi: async () =>
                    await new Grana('main', 'project', 'acme', postavka.gitHubKlijent).dohvatiKomitove(),
            }

            await provjeri.rejects(operacije[resurs](), greska => {
                provjeri.equal(postavka.greske.length, 1)
                provjeri.strictEqual(greska, postavka.greske[0])
                provjeri.ok(greska instanceof Error)
                provjeri.match(greska.message, /greska na kasnijoj stranici/)
                return true
            })
            provjeri.equal(postavka.zahtjevi.length, 2)
        },
    )
}

await testiraj(
    'brojac prosljedjuje gresku pri ucitavanju stranica grane bez objavljivanja djelimicnog broja komitova',
    async () => {
        const postavka = pripremiGitHub(adresa => {
            if (adresa.pathname === '/orgs/acme/repos') return { podaci: [{ name: 'project' }] }
            if (adresa.pathname === '/repos/acme/project/branches') return { podaci: [{ name: 'main' }] }
            provjeri.equal(adresa.pathname, '/repos/acme/project/commits')
            if (adresa.searchParams.get('page') === '2') {
                return { status: 403, podaci: { message: 'Prekoraceno ogranicenje broja API zahtjeva' } }
            }
            return { podaci: [{ sha: 'first-page' }], sljedeca: sljedecaStranica(adresa) }
        })

        await provjeri.rejects(
            new BrojacKomitova(new Organizacija('acme', postavka.gitHubKlijent)).prebrojKomitove(),
            greska => {
                provjeri.strictEqual(greska, postavka.greske[0])
                return true
            },
        )
    },
)

await testiraj('brojač ograničava istovremene zahtjeve i učitava sve grane i stranice', async () => {
    let aktivniZahtjevi = 0
    let najviseAktivnih = 0
    const postavka = pripremiGitHub(async adresa => {
        aktivniZahtjevi++
        najviseAktivnih = Math.max(najviseAktivnih, aktivniZahtjevi)
        try {
            await new Promise(resolve => setTimeout(resolve, 2))
            if (adresa.pathname === '/orgs/acme/repos') {
                return { podaci: [{ name: 'one' }, { name: 'two' }, { name: 'three' }] }
            }
            if (adresa.pathname.endsWith('/branches')) {
                return {
                    podaci: Array.from({ length: 9 }, (_, indeks) => ({ name: `branch-${indeks}` })),
                }
            }
            provjeriFiltereKomitova(adresa)
            const grana = adresa.searchParams.get('sha')
            return podijeliNaStranice(adresa, [{ sha: `${grana}-first` }], [{ sha: `${grana}-last` }])
        } finally {
            aktivniZahtjevi--
        }
    })

    const broj = await new BrojacKomitova(new Organizacija('acme', postavka.gitHubKlijent)).prebrojKomitove(
        'alice',
        pocetak,
        kraj,
    )

    provjeri.equal(broj, 54)
    provjeri.ok(najviseAktivnih > 1)
    provjeri.ok(najviseAktivnih <= 4)
    provjeri.equal(aktivniZahtjevi, 0)
    provjeri.equal(postavka.zahtjevi.filter(adresa => adresa.pathname.endsWith('/commits')).length, 54)
})
