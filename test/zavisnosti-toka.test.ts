import provjeri from 'node:assert/strict'
import { test as testiraj } from 'node:test'
import { Api as TelegramApi } from 'grammy'
import { OpenAI as OpenAIKlijent } from 'openai'
import {
    napraviGeneratorMotivacije,
    napraviPripremuStatistike,
    napraviTelegramIsporuku,
} from '../src/cloudflare/zavisnosti.js'

const okruzenje = {
    BOT_TOKEN: '123:probni-token',
    BOT_USERNAME: 'danilo_test_bot',
    TELEGRAM_WEBHOOK_SECRET: 'probna-tajna',
    GITHUB_TOKEN: 'probni-github-token',
    GITHUB_ORG: 'probno',
    OPENAI_API_TOKEN: 'probni-openai-token',
    ADMIN_TELEGRAM_IDS: '123',
    TELEGRAM_CHAT_ID: '-456',
    OKRUZENJE: 'probno',
} satisfies Parameters<typeof napraviPripremuStatistike>[0]

await testiraj('dnevna priprema koristi Responses API koji izvršava GitHub MCP pozive', async kontekst => {
    const tijela: string[] = []
    const mreza = kontekst.mock.method(globalThis, 'fetch', async (ulaz: RequestInfo | URL, opcije?: RequestInit) => {
        const zahtjev = ulaz instanceof Request ? ulaz : new Request(ulaz, opcije)
        const adresa = new URL(zahtjev.url)
        provjeri.equal(adresa.hostname, 'api.openai.com')
        provjeri.equal(adresa.pathname, '/v1/responses')
        provjeri.equal(zahtjev.headers.get('authorization'), 'Bearer probni-openai-token')
        tijela.push(await zahtjev.text())

        const pozivi = [
            {
                name: 'search_repositories',
                arguments: JSON.stringify({ query: 'org:probno fork:true', page: 1, perPage: 100 }),
                output: JSON.stringify({
                    total_count: 1,
                    incomplete_results: false,
                    items: [{ name: 'repo', full_name: 'probno/repo' }],
                }),
            },
            {
                name: 'list_branches',
                arguments: JSON.stringify({ owner: 'probno', repo: 'repo', page: 1, perPage: 100 }),
                output: JSON.stringify([{ name: 'main', sha: 'vrh-grane' }]),
            },
            {
                name: 'list_commits',
                arguments: JSON.stringify({
                    owner: 'probno',
                    repo: 'repo',
                    sha: 'vrh-grane',
                    since: '2026-03-28T23:00:00.000Z',
                    until: '2026-03-29T21:55:00.000Z',
                    page: 1,
                    perPage: 100,
                }),
                output: JSON.stringify([{ sha: 'prvi', commit: { message: 'Dodaj provjeru linkova' } }]),
            },
        ]

        return Response.json({
            id: 'probni-odgovor',
            status: 'completed',
            error: null,
            incomplete_details: null,
            output: [
                ...pozivi.map((poziv, indeks) => ({
                    id: `mcp-${indeks}`,
                    type: 'mcp_call',
                    server_label: 'github',
                    status: 'completed',
                    error: null,
                    ...poziv,
                })),
                {
                    id: 'poruka',
                    type: 'message',
                    role: 'assistant',
                    status: 'completed',
                    content: [
                        {
                            type: 'output_text',
                            text: 'Linkovi se danas provjeravaju, kafa se još kuva.',
                            annotations: [],
                        },
                    ],
                },
            ],
        })
    })

    const ishod = await napraviPripremuStatistike(okruzenje).pripremi(new Date('2026-03-29T21:55:00.000Z'))

    provjeri.deepEqual(ishod, {
        vrsta: 'poruka',
        tekst: '<b>Dnevni pregled</b>\n<i>29. 3. 2026. · 00:00–23:55 (Europe/Podgorica)</i>\n\nLinkovi se danas provjeravaju, kafa se još kuva.',
    })
    provjeri.equal(mreza.mock.callCount(), 1)
    const [tijelo] = tijela
    provjeri.match(tijelo, /"type":"mcp"/)
    provjeri.match(tijelo, /api.githubcopilot.com/)
    provjeri.match(tijelo, /"authorization":"probni-github-token"/)
    provjeri.match(tijelo, /2026-03-28T23:00:00.000Z/)
    provjeri.match(tijelo, /2026-03-29T21:55:00.000Z/)
    provjeri.doesNotMatch(tijelo, /probni-openai-token/)
})

await testiraj('motivaciona priprema povezuje OpenAI bez GitHub poziva', async kontekst => {
    const generisi = kontekst.mock.method(
        OpenAIKlijent.Chat.Completions.prototype,
        'create',
        async () => await Promise.resolve({ choices: [{ message: { content: 'Probni citat.' } }] }),
    )
    const github = kontekst.mock.method(
        globalThis,
        'fetch',
        async () => await Promise.reject(new Error('GitHub se ne poziva tokom pripreme motivacije.')),
    )

    provjeri.equal(await napraviGeneratorMotivacije(okruzenje).generisi(), 'Probni citat.')
    provjeri.equal(generisi.mock.callCount(), 1)
    provjeri.equal(github.mock.callCount(), 0)
})

for (const { naziv, tekst, nitId } of [
    {
        naziv: 'čuva HTML oznake, posebne znakove i izvornu nit',
        tekst: '🚀 <b>A&amp;B</b> <i>radi</i> na <code>kk/grana_sa_crtom</code>: 2 &lt; 3 &gt; 1.',
        nitId: 42,
    },
    {
        naziv: 'podržava HTML poruku bez niti',
        tekst: '<i>Prvo kafa, pa komit.</i>',
        nitId: undefined,
    },
    {
        naziv: 'čuva običan odgovor o nedostupnoj statistici',
        tekst: 'Statistika trenutno nije dostupna. Pokušaj ponovo kasnije.',
        nitId: 42,
    },
]) {
    await testiraj(`Telegram isporuka ${naziv}`, async kontekst => {
        const posalji = kontekst.mock.method(
            TelegramApi.prototype,
            'sendMessage',
            async () =>
                await Promise.resolve({
                    message_id: 1,
                    date: 0,
                    chat: { id: -123, type: 'private' as const, first_name: 'Probno' },
                    text: tekst,
                }),
        )

        await napraviTelegramIsporuku(okruzenje)({ razgovorId: -123, nitId }, tekst)

        provjeri.deepEqual(
            posalji.mock.calls.map(poziv => poziv.arguments),
            [[-123, tekst, { message_thread_id: nitId, parse_mode: 'HTML' }]],
        )
    })
}
