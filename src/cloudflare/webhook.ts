import { z as zod } from 'zod'

const semaId = zod.number().int().safe()
const semaKorisnika = zod.object({ id: semaId.positive(), is_bot: zod.boolean(), first_name: zod.string() })
const semaRazgovora = zod.discriminatedUnion('type', [
    zod.object({ id: semaId, type: zod.literal('private'), first_name: zod.string() }),
    zod.object({ id: semaId, type: zod.literal('group'), title: zod.string() }),
    zod.object({ id: semaId, type: zod.literal('supergroup'), title: zod.string() }),
])

export const semaNovosti = zod.object({
    update_id: semaId.nonnegative(),
    message: zod.object({
        message_id: semaId.positive(),
        date: semaId.nonnegative(),
        from: semaKorisnika,
        chat: semaRazgovora,
        message_thread_id: semaId.positive().optional(),
        text: zod.string().optional(),
        entities: zod
            .array(zod.object({ type: zod.string(), offset: semaId.nonnegative(), length: semaId.positive() }))
            .transform(stavke =>
                stavke
                    .filter(stavka => stavka.type === 'bot_command')
                    .map(stavka => ({ ...stavka, type: 'bot_command' as const })),
            )
            .optional(),
    }),
})
