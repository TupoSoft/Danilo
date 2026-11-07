import provjeri from 'node:assert/strict'
import { test as testiraj } from 'node:test'
import { OpenAI as OpenAIKlijent } from 'openai'
import { GeneratorMotivacionihCitata } from '../src/generator-motivacionih-citata.js'
import SISTEMSKO_UPUTSTVO_MOTIVACIONOG_CITATA from '../src/uputstva/motivacioni-citat.md?raw'

function pripremiKlijenta(): OpenAIKlijent {
    return new OpenAIKlijent({
        apiKey: 'probni-openai-token',
        fetch: async () => await Promise.reject(new Error('Neočekivan mrežni zahtjev za OpenAI')),
    })
}

await testiraj('generator vraća citat uz postojeći model i uputstva', async kontekst => {
    const klijent = pripremiKlijenta()
    const generisanje = kontekst.mock.method(
        klijent.chat.completions,
        'create',
        async () =>
            await Promise.resolve({ choices: [{ message: { content: '<i>Riješi jednu stvar, pa stavi kafu.</i>' } }] }),
    )

    provjeri.equal(
        await new GeneratorMotivacionihCitata(klijent).generisi(),
        '<i>Riješi jednu stvar, pa stavi kafu.</i>',
    )
    provjeri.deepEqual(
        generisanje.mock.calls.map(poziv => poziv.arguments),
        [
            [
                {
                    model: 'gpt-5',
                    messages: [
                        {
                            role: 'system',
                            content: SISTEMSKO_UPUTSTVO_MOTIVACIONOG_CITATA,
                        },
                        { role: 'user', content: 'Napiši kratku motivacionu poruku za ekipu.' },
                    ],
                },
            ],
        ],
    )
    provjeri.match(SISTEMSKO_UPUTSTVO_MOTIVACIONOG_CITATA, /crnogorskom jeziku, latinicom/)
    provjeri.match(SISTEMSKO_UPUTSTVO_MOTIVACIONOG_CITATA, /jednu ili dvije kratke, konkretne rečenice/)
    provjeri.match(SISTEMSKO_UPUTSTVO_MOTIVACIONOG_CITATA, /tačno jednim parom oznaka `<i>tekst<\/i>`/)
    provjeri.match(SISTEMSKO_UPUTSTVO_MOTIVACIONOG_CITATA, /Ne vrijeđaj ljude/)
    provjeri.match(SISTEMSKO_UPUTSTVO_MOTIVACIONOG_CITATA, /`&amp;`, `&lt;` i `&gt;`/)
    provjeri.match(SISTEMSKO_UPUTSTVO_MOTIVACIONOG_CITATA, /izmišljeni.*ne kopiraj/s)
    provjeri.match(SISTEMSKO_UPUTSTVO_MOTIVACIONOG_CITATA, /a &lt; b &amp; c/)
})

for (const { naziv, sadrzaj, ocekivano } of [
    {
        naziv: 'null sadržaj koristi rezervni citat',
        sadrzaj: null,
        ocekivano: 'Rad je stvoren za konje, a ne za ljude.',
    },
    { naziv: 'prazan citat ostaje prazan', sadrzaj: '', ocekivano: '' },
]) {
    await testiraj(naziv, async kontekst => {
        const klijent = pripremiKlijenta()
        kontekst.mock.method(
            klijent.chat.completions,
            'create',
            async () => await Promise.resolve({ choices: [{ message: { content: sadrzaj } }] }),
        )

        provjeri.equal(await new GeneratorMotivacionihCitata(klijent).generisi(), ocekivano)
    })
}

await testiraj('prazan niz izbora koristi odgovor pri grešci i bilježi bezbjedan događaj', async kontekst => {
    const klijent = pripremiKlijenta()
    kontekst.mock.method(klijent.chat.completions, 'create', async () => await Promise.resolve({ choices: [] }))
    const greske = kontekst.mock.method(console, 'error', () => undefined)

    provjeri.equal(await new GeneratorMotivacionihCitata(klijent).generisi(), 'Ođe se ne radi.')
    provjeri.equal(greske.mock.callCount(), 1)
    provjeri.deepEqual(
        greske.mock.calls.map(poziv => poziv.arguments),
        [[{ dogadjaj: 'motivacija-nedostupna', poruka: 'Greška prilikom generisanja citata:' }]],
    )
})

await testiraj('neuspjeh OpenAI poziva ne zapisuje tajne iz greške niti zahtjeva', async kontekst => {
    const klijent = pripremiKlijenta()
    const greska = Object.assign(new Error('Authorization: Bearer probni-osjetljivi-token'), {
        headers: { Authorization: 'Bearer probni-osjetljivi-token' },
        request: { url: 'https://api.telegram.org/bot123:probni-osjetljivi-token/sendMessage' },
    })
    kontekst.mock.method(klijent.chat.completions, 'create', async () => await Promise.reject(greska))
    const greske = kontekst.mock.method(console, 'error', () => undefined)

    provjeri.equal(await new GeneratorMotivacionihCitata(klijent).generisi(), 'Ođe se ne radi.')
    provjeri.deepEqual(
        greske.mock.calls.map(poziv => poziv.arguments),
        [[{ dogadjaj: 'motivacija-nedostupna', poruka: 'Greška prilikom generisanja citata:' }]],
    )
    provjeri.doesNotMatch(JSON.stringify(greske.mock.calls.map(poziv => poziv.arguments)), /probni-osjetljivi-token/)
})
