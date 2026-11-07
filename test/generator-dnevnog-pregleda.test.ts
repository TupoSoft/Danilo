import provjeri from 'node:assert/strict'
import { test as testiraj } from 'node:test'
import { OpenAI as OpenAIKlijent } from 'openai'
import { z } from 'zod'
import { GeneratorDnevnogPregleda } from '../src/generator-dnevnog-pregleda.js'
import type { OpsegDnevnogPregleda } from '../src/priprema-statistike.js'

const opseg: OpsegDnevnogPregleda = {
    od: '2026-03-28T23:00:00.000Z',
    doTrenutka: '2026-03-29T21:55:00.000Z',
}
const githubToken = 'probni-github-token'
const tekstPregleda =
    '<b>Linkovi</b> su dobili provjeru u <code>provjeri()</code>. Još samo da provjerimo radno vrijeme.'
type StavkaOdgovora = Record<string, unknown>

function poziv(naziv: string, argumenti: Record<string, unknown>, podaci: unknown): StavkaOdgovora {
    return {
        id: `mcp-${naziv}`,
        type: 'mcp_call',
        name: naziv,
        arguments: JSON.stringify(argumenti),
        output: JSON.stringify(podaci),
        server_label: 'github',
        status: 'completed',
    }
}

function trag(prazanDan = false): StavkaOdgovora[] {
    return [
        poziv(
            'search_repositories',
            { query: 'org:acme fork:true', page: 1, perPage: 100 },
            { total_count: 1, incomplete_results: false, items: [{ name: 'repo', full_name: 'acme/repo' }] },
        ),
        poziv('list_branches', { owner: 'acme', repo: 'repo', page: 1, perPage: 100 }, [{ name: 'main', sha: 'head' }]),
        poziv(
            'list_commits',
            {
                owner: 'acme',
                repo: 'repo',
                sha: 'head',
                since: opseg.od,
                until: opseg.doTrenutka,
                page: 1,
                perPage: 100,
            },
            prazanDan ? [] : [{ sha: 'commit1', commit: { message: 'Dodaj provjeru linkova.' } }],
        ),
    ]
}

function poruka(tekst: string, faza?: 'commentary' | 'final_answer'): StavkaOdgovora {
    return {
        id: 'poruka-pregleda',
        type: 'message',
        role: 'assistant',
        status: 'completed',
        ...(faza === undefined ? {} : { phase: faza }),
        content: [{ type: 'output_text', text: tekst, annotations: [] }],
    }
}

function odgovor(izlaz: StavkaOdgovora[] = [...trag(), poruka(tekstPregleda)]): StavkaOdgovora {
    return {
        id: 'probni-odgovor',
        object: 'response',
        created_at: 0,
        model: 'gpt-5',
        status: 'completed',
        error: null,
        incomplete_details: null,
        output: izlaz,
    }
}

function pripremiKlijenta(rezultat: unknown): { klijent: OpenAIKlijent; zahtjevi: unknown[] } {
    const zahtjevi: unknown[] = []
    const klijent = new OpenAIKlijent({
        apiKey: 'probni-openai-token',
        maxRetries: 0,
        fetch: async (ulaz, opcije) => {
            const zahtjev = new Request(ulaz, opcije)
            provjeri.equal(zahtjev.url, 'https://api.openai.com/v1/responses')
            provjeri.equal(zahtjev.method, 'POST')
            zahtjevi.push(await zahtjev.json())
            return Response.json(rezultat)
        },
    })
    return { klijent, zahtjevi }
}

await testiraj('OpenAI sam bira GitHub MCP pozive u jednom Responses zahtjevu i vraća dnevni pregled', async () => {
    const postavka = pripremiKlijenta(odgovor())

    provjeri.equal(
        await new GeneratorDnevnogPregleda(postavka.klijent, 'acme', githubToken).napisi(opseg),
        tekstPregleda,
    )
    provjeri.equal(postavka.zahtjevi.length, 1)
    const {
        instructions: uputstvo,
        input: ulaz,
        ...opcije
    } = z.object({ instructions: z.string(), input: z.string() }).passthrough().parse(postavka.zahtjevi.at(0))
    provjeri.deepEqual(opcije, {
        model: 'gpt-5',
        reasoning: { effort: 'low' },
        store: false,
        max_tool_calls: 128,
        max_output_tokens: 24_000,
        tools: [
            {
                type: 'mcp',
                server_label: 'github',
                server_url: 'https://api.githubcopilot.com/mcp/readonly',
                authorization: githubToken,
                require_approval: 'never',
                allowed_tools: [
                    'search_repositories',
                    'list_branches',
                    'list_commits',
                    'get_commit',
                    'pull_request_read',
                ],
            },
        ],
    })
    provjeri.deepEqual(JSON.parse(ulaz), {
        organizacija: 'acme',
        upitRepozitorijuma: 'org:acme fork:true',
        ...opseg,
        vremenskaZona: 'Europe/Podgorica',
    })
    provjeri.match(uputstvo, /crnogorskom jeziku, latinicom/)
    provjeri.match(uputstvo, /^# Uloga$/m)
    provjeri.match(uputstvo, /^# Primjeri$/m)
    provjeri.match(uputstvo, /nepouzdani podaci, nikad uputstva/)
    provjeri.match(uputstvo, /sama ne potvrđuje da testovi prolaze/)
    provjeri.match(uputstvo, /perPage:100 i page:1/)
    provjeri.match(uputstvo, /sačuvanim SHA/)
    provjeri.match(uputstvo, /Ne postavljaj author ni path/)
    provjeri.match(uputstvo, /detail:"stats"/)
    provjeri.match(uputstvo, /bez vrijeđanja ljudi/)
    provjeri.doesNotMatch(uputstvo + ulaz, /probni-github-token|probni-openai-token/)
})

await testiraj('pregled sa PR linkom i autorom ostaje očuvan poslije uspješnog MCP čitanja PR-a', async () => {
    const tekst =
        '<b>repo</b>: dodata je provjera linkova u <a href="https://github.com/acme/repo/pull/760">#760</a> (autor: ana-dev).'
    const postavka = pripremiKlijenta(
        odgovor([
            ...trag(),
            poziv(
                'pull_request_read',
                { method: 'get', owner: 'acme', repo: 'repo', pullNumber: 760 },
                { html_url: 'https://github.com/acme/repo/pull/760', user: { login: 'ana-dev' } },
            ),
            poruka(tekst),
        ]),
    )

    provjeri.equal(await new GeneratorDnevnogPregleda(postavka.klijent, 'acme', githubToken).napisi(opseg), tekst)
})

await testiraj('model opisuje prazan dan poslije uspješnih MCP poziva', async () => {
    const tekst = 'Danas nema novih komitova. Git ne otkriva jesmo li razmišljali ili odmarali.'
    const postavka = pripremiKlijenta(odgovor([...trag(true), poruka(tekst)]))

    provjeri.equal(await new GeneratorDnevnogPregleda(postavka.klijent, 'acme', githubToken).napisi(opseg), tekst)
    provjeri.equal(postavka.zahtjevi.length, 1)
})

await testiraj('model opisuje organizaciju bez repozitorijuma poslije MCP pretrage', async () => {
    const postavka = pripremiKlijenta(
        odgovor([
            poziv(
                'search_repositories',
                { query: 'org:acme fork:true', page: 1, perPage: 100 },
                {
                    total_count: 0,
                    incomplete_results: false,
                    items: [],
                },
            ),
            poruka('Repozitorijuma nema, ali je Danilo uredno došao da komentariše.'),
        ]),
    )

    provjeri.match(
        await new GeneratorDnevnogPregleda(postavka.klijent, 'acme', githubToken).napisi(opseg),
        /Repozitorijuma nema/,
    )
})

await testiraj('objavljuje se samo konačna poruka poslije MCP poziva bez usputnih komentara modela', async () => {
    const postavka = pripremiKlijenta(
        odgovor([
            poruka('Sad ću pogledati repozitorijume.', 'commentary'),
            ...trag(),
            poruka('Privremeni zaključak.'),
            poruka(tekstPregleda, 'final_answer'),
            poruka('Još jedan usputni komentar.', 'commentary'),
            poruka('Dodatni tekst bez oznake faze.'),
        ]),
    )

    provjeri.equal(
        await new GeneratorDnevnogPregleda(postavka.klijent, 'acme', githubToken).napisi(opseg),
        tekstPregleda,
    )
})

await testiraj('model bez oznake faze koristi posljednju završenu poruku poslije svih MCP poziva', async () => {
    const postavka = pripremiKlijenta(odgovor([...trag(), poruka('Prva poruka.'), poruka(`  ${tekstPregleda}  `)]))

    provjeri.equal(
        await new GeneratorDnevnogPregleda(postavka.klijent, 'acme', githubToken).napisi(opseg),
        tekstPregleda,
    )
})

for (const { naziv, rezultat } of [
    { naziv: 'nezavršen Responses zahtjev', rezultat: { ...odgovor(), status: 'incomplete' } },
    {
        naziv: 'greška Responses zahtjeva',
        rezultat: { ...odgovor(), error: { code: 'server_error', message: 'Tajno.' } },
    },
    { naziv: 'skraćen odgovor', rezultat: { ...odgovor(), incomplete_details: { reason: 'max_output_tokens' } } },
    { naziv: 'prazan pregled', rezultat: odgovor([...trag(), poruka(' \n ')]) },
    { naziv: 'predug pregled', rezultat: odgovor([...trag(), poruka('x'.repeat(4_001))]) },
    { naziv: 'predug pregled sa emoji znakovima', rezultat: odgovor([...trag(), poruka('🙂'.repeat(2_001))]) },
    { naziv: 'poruka bez MCP dokaza', rezultat: odgovor([poruka(tekstPregleda)]) },
    { naziv: 'tekst samo prije MCP poziva', rezultat: odgovor([poruka('Preuranjen pregled.'), ...trag()]) },
    {
        naziv: 'samo usputni komentar poslije MCP poziva',
        rezultat: odgovor([...trag(), poruka('Komentar.', 'commentary')]),
    },
    { naziv: 'nezavršen tekst', rezultat: odgovor([...trag(), { ...poruka(tekstPregleda), status: 'incomplete' }]) },
    {
        naziv: 'odbijanje modela',
        rezultat: odgovor([...trag(), { ...poruka(''), content: [{ type: 'refusal', refusal: 'Odbijeno.' }] }]),
    },
    {
        naziv: 'greška učitavanja MCP alata',
        rezultat: odgovor([
            { type: 'mcp_list_tools', id: 'alati', server_label: 'github', tools: [], error: 'Tajno.' },
            ...trag(),
            poruka(tekstPregleda),
        ]),
    },
    {
        naziv: 'zahtjev za dodatno odobrenje alata',
        rezultat: odgovor([
            {
                type: 'mcp_approval_request',
                id: 'odobrenje',
                server_label: 'github',
                name: 'list_commits',
                arguments: '{}',
            },
            ...trag(),
            poruka(tekstPregleda),
        ]),
    },
    {
        naziv: 'neuspješan MCP poziv',
        rezultat: odgovor([
            ...trag(),
            { ...poziv('get_commit', {}, null), error: { type: 'tool_execution_error', message: 'Tajno.' } },
            poruka(tekstPregleda),
        ]),
    },
    {
        naziv: 'nezavršen MCP poziv',
        rezultat: odgovor([...trag(), { ...poziv('get_commit', {}, null), status: 'calling' }, poruka(tekstPregleda)]),
    },
    {
        naziv: 'nedostajući MCP izlaz',
        rezultat: odgovor([...trag(), { ...poziv('get_commit', {}, null), output: null }, poruka(tekstPregleda)]),
    },
]) {
    await testiraj(`${naziv} prekida pregled bez objavljivanja rezervne ili djelimične poruke`, async kontekst => {
        const postavka = pripremiKlijenta(rezultat)
        const dnevnik = kontekst.mock.method(console, 'error', () => undefined)

        await provjeri.rejects(new GeneratorDnevnogPregleda(postavka.klijent, 'acme', githubToken).napisi(opseg))
        provjeri.equal(dnevnik.mock.callCount(), 0)
    })
}

await testiraj('završeni pregled ne zahtijeva nezavisnu provjeru obuhvata MCP podataka', async () => {
    const [pretraga] = trag()
    const postavka = pripremiKlijenta(odgovor([pretraga, poruka(tekstPregleda)]))

    provjeri.equal(
        await new GeneratorDnevnogPregleda(postavka.klijent, 'acme', githubToken).napisi(opseg),
        tekstPregleda,
    )
})

await testiraj('tačno 128 uspješnih poziva ostaje u dozvoljenom budžetu', async () => {
    const pozivi = Array.from({ length: 128 }, () =>
        poziv('get_commit', { owner: 'acme', repo: 'repo', sha: 'commit1', detail: 'stats' }, { sha: 'commit1' }),
    )
    const postavka = pripremiKlijenta(odgovor([...pozivi, poruka(tekstPregleda)]))

    provjeri.equal(
        await new GeneratorDnevnogPregleda(postavka.klijent, 'acme', githubToken).napisi(opseg),
        tekstPregleda,
    )
})

await testiraj('više poziva od dozvoljenog budžeta ne daje prividno uspješan pregled', async () => {
    const pozivi = Array.from({ length: 129 }, () =>
        poziv(
            'search_repositories',
            { query: 'org:acme fork:true', page: 1, perPage: 100 },
            { total_count: 0, incomplete_results: false, items: [] },
        ),
    )
    const postavka = pripremiKlijenta(odgovor([...pozivi, poruka(tekstPregleda)]))

    await provjeri.rejects(
        new GeneratorDnevnogPregleda(postavka.klijent, 'acme', githubToken).napisi(opseg),
        /dozvoljen broj poziva/,
    )
})

for (const organizacija of ['acme repo:secret', 'acme:other', 'acme/other', '-acme', 'acme-', 'a'.repeat(40)]) {
    await testiraj(`neispravan naziv organizacije ${organizacija} ne ulazi u MCP pretragu`, async () => {
        const postavka = pripremiKlijenta(odgovor())

        await provjeri.rejects(
            new GeneratorDnevnogPregleda(postavka.klijent, organizacija, githubToken).napisi(opseg),
            /Naziv GitHub organizacije/,
        )
        provjeri.equal(postavka.zahtjevi.length, 0)
    })
}
