import provjeri from 'node:assert/strict'
import { env as okruzenje } from 'node:process'
import { test as testiraj } from 'node:test'
import { pocetakDanaISO } from '../src/pomocno/datum.js'

const slucajeviPonoci = [
    {
        naziv: 'ponoc zimi koristi pomjeraj UTC+1',
        trenutak: '2026-01-15T12:00:00.000Z',
        ocekivano: '2026-01-14T23:00:00.000Z',
    },
    {
        naziv: 'ponoc ljeti koristi pomjeraj UTC+2',
        trenutak: '2026-07-15T12:00:00.000Z',
        ocekivano: '2026-07-14T22:00:00.000Z',
    },
    {
        naziv: 'pri prelasku na ljetnje racunanje vremena koristi se pomjeraj koji vazi u ponoc',
        trenutak: '2026-03-29T12:00:00.000Z',
        ocekivano: '2026-03-28T23:00:00.000Z',
    },
    {
        naziv: 'pri prelasku na zimsko racunanje vremena koristi se pomjeraj koji vazi u ponoc',
        trenutak: '2026-10-25T12:00:00.000Z',
        ocekivano: '2026-10-24T22:00:00.000Z',
    },
    {
        naziv: 'trenutak prije lokalne ponoci zimi pripada prethodnom danu',
        trenutak: '2026-01-14T22:59:59.999Z',
        ocekivano: '2026-01-13T23:00:00.000Z',
    },
    {
        naziv: 'lokalna ponoc zimi zapocinje novi dan prije ponoci po UTC-u',
        trenutak: '2026-01-14T23:00:00.000Z',
        ocekivano: '2026-01-14T23:00:00.000Z',
    },
    {
        naziv: 'trenutak prije lokalne ponoci ljeti pripada prethodnom danu',
        trenutak: '2026-07-14T21:59:59.999Z',
        ocekivano: '2026-07-13T22:00:00.000Z',
    },
    {
        naziv: 'lokalna ponoc ljeti zapocinje novi dan prije ponoci po UTC-u',
        trenutak: '2026-07-14T22:00:00.000Z',
        ocekivano: '2026-07-14T22:00:00.000Z',
    },
]

for (const { naziv, trenutak, ocekivano } of slucajeviPonoci) {
    void testiraj(naziv, () => {
        const datum = new Date(trenutak)

        provjeri.equal(pocetakDanaISO(datum), ocekivano)
        provjeri.equal(datum.toISOString(), trenutak)
    })
}

void testiraj('kalendarski dan u Podgorici ne zavisi od vremenske zone sistema', () => {
    const { TZ: prvobitnaVremenskaZona } = okruzenje

    try {
        for (const vremenskaZona of ['UTC', 'America/Los_Angeles']) {
            okruzenje.TZ = vremenskaZona

            for (const { trenutak, ocekivano } of slucajeviPonoci) {
                provjeri.equal(pocetakDanaISO(new Date(trenutak)), ocekivano)
            }
        }
    } finally {
        if (prvobitnaVremenskaZona === undefined) {
            delete okruzenje.TZ
        } else {
            okruzenje.TZ = prvobitnaVremenskaZona
        }
    }
})

void testiraj('neispravan trenutak izvjestaja se odbija', () => {
    provjeri.throws(() => pocetakDanaISO(new Date(Number.NaN)), RangeError)
})
