import provjeri from 'node:assert/strict'
import { test as testiraj } from 'node:test'
import { parsirajKonfiguraciju } from '../src/okruzenje.js'

const probnoOkruzenje = {
    BOT_TOKEN: '123:test-token',
    GITHUB_TOKEN: 'test-github-token',
    GITHUB_ORG: 'test-org',
    OPENAI_API_TOKEN: 'test-openai-token',
    ADMIN_TELEGRAM_IDS: '123, 456',
    TELEGRAM_CHAT_ID: '-789',
}

void testiraj('parser mapira provjerenu konfiguraciju bez izmjene ulaza i može se ponovo koristiti', () => {
    const ulaz = Object.freeze({ ...probnoOkruzenje })
    const rezultat = parsirajKonfiguraciju(ulaz)

    provjeri.equal(rezultat.success, true)
    provjeri.deepEqual(rezultat.data, {
        tokenBota: '123:test-token',
        githubToken: 'test-github-token',
        githubOrganizacija: 'test-org',
        openaiApiToken: 'test-openai-token',
        idJeviTelegramAdministratora: [123, 456],
        idTelegramRazgovora: -789,
    })
    provjeri.deepEqual(ulaz, probnoOkruzenje)
    const drugiRezultat = parsirajKonfiguraciju({ ...ulaz, GITHUB_ORG: 'druga-org' })
    provjeri.equal(drugiRezultat.success, true)
    provjeri.equal(drugiRezultat.data.githubOrganizacija, 'druga-org')
    provjeri.equal(rezultat.data.githubOrganizacija, 'test-org')
})

void testiraj('parser zadržava postojeće poruke za obavezne, prazne i netekstualne vrijednosti', () => {
    const rezultat = parsirajKonfiguraciju({
        ...probnoOkruzenje,
        BOT_TOKEN: undefined,
        GITHUB_TOKEN: '',
        GITHUB_ORG: 7,
    })

    provjeri.equal(rezultat.success, false)
    provjeri.deepEqual(rezultat.error.format(), {
        _errors: [],
        BOT_TOKEN: { _errors: ['Promjenljiva okruženja je obavezna.'] },
        GITHUB_TOKEN: { _errors: ['Vrijednost ne smije biti prazna.'] },
        GITHUB_ORG: { _errors: ['Vrijednost mora biti tekst.'] },
    })
})

void testiraj('parser čuva postojeću konverziju brojeva i ne skraćuje tokene', () => {
    const rezultat = parsirajKonfiguraciju({
        ...probnoOkruzenje,
        BOT_TOKEN: ' token\n',
        ADMIN_TELEGRAM_IDS: '123, , tekst',
        TELEGRAM_CHAT_ID: '',
    })

    provjeri.equal(rezultat.success, true)
    provjeri.equal(rezultat.data.tokenBota, ' token\n')
    provjeri.deepEqual(rezultat.data.idJeviTelegramAdministratora, [123, 0, Number.NaN])
    provjeri.equal(rezultat.data.idTelegramRazgovora, 0)
})

void testiraj('parser ne učitava _FILE vrijednosti', () => {
    const rezultat = parsirajKonfiguraciju({ ...probnoOkruzenje, BOT_TOKEN_FILE: '/ne/postoji/tajna' })

    provjeri.equal(rezultat.success, true)
    provjeri.equal(rezultat.data.tokenBota, probnoOkruzenje.BOT_TOKEN)
})
