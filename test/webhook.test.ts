import provjeri from 'node:assert/strict'
import { test as testiraj } from 'node:test'
import { semaNovosti } from '../src/cloudflare/webhook.js'

function novost(poruka: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        update_id: 0,
        message: {
            message_id: 1,
            date: 0,
            from: { id: 123, is_bot: false, first_name: 'Admin' },
            chat: { id: 123, type: 'private', first_name: 'Admin' },
            ...poruka,
        },
    }
}

void testiraj('šema novosti odbija nepotpune poruke, nepodržane razgovore i neispravne identifikatore', () => {
    for (const ulaz of [
        null,
        [],
        {},
        { update_id: 1 },
        { ...novost(), update_id: '1' },
        { ...novost(), update_id: -1 },
        { ...novost(), update_id: Number.MAX_SAFE_INTEGER + 1 },
        novost({ message_id: 0 }),
        novost({ date: -1 }),
        novost({ from: { id: 0, is_bot: false, first_name: 'Admin' } }),
        novost({ chat: { id: -123, type: 'channel', title: 'Kanal' } }),
        novost({ message_thread_id: 0 }),
        novost({ entities: [{ type: 'bot_command', offset: -1, length: 6 }] }),
        novost({ entities: [{ type: 'bot_command', offset: 0, length: 0 }] }),
    ]) {
        provjeri.equal(semaNovosti.safeParse(ulaz).success, false)
    }
})

void testiraj('šema prihvata privatne i grupne poruke bez teksta, entiteta ili niti', () => {
    for (const razgovor of [
        { id: 123, type: 'private', first_name: 'Admin' },
        { id: -123, type: 'group', title: 'Grupa' },
        { id: -123, type: 'supergroup', title: 'Supergrupa' },
    ]) {
        const rezultat = semaNovosti.parse(novost({ chat: razgovor }))

        provjeri.deepEqual(rezultat.message.chat, razgovor)
        provjeri.equal(rezultat.message.text, undefined)
        provjeri.equal(rezultat.message.entities, undefined)
        provjeri.equal(rezultat.message.message_thread_id, undefined)
    }
})

void testiraj('šema čuva komandu i nit, a uklanja ostale entitete i nepoznata polja', () => {
    const ulaz = novost({
        text: '/stats',
        message_thread_id: 42,
        entities: [
            { type: 'bot_command', offset: 0, length: 6, dodatno: 'nepoznato polje' },
            { type: 'bold', offset: 0, length: 6 },
        ],
        dodatno: 'nepoznato polje',
    })

    const rezultat = semaNovosti.parse({ ...ulaz, dodatno: 'nepoznato polje' })

    provjeri.deepEqual(
        rezultat,
        novost({
            text: '/stats',
            message_thread_id: 42,
            entities: [{ type: 'bot_command', offset: 0, length: 6 }],
        }),
    )
})
