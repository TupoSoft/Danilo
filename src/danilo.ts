import type { Bot, CommandContext as KontekstKomande, Context as Kontekst } from 'grammy'
import { NULA } from './konstante.js'
import type { OdgovorNaKomandu, PokretacPoslova } from './poslovi.js'

export class Danilo {
    constructor(
        private readonly bot: Bot,
        private readonly idJeviAdministratora: readonly number[],
        private readonly pokretacPoslova: PokretacPoslova,
    ) {}

    registrujKomande(): void {
        this.bot.use(async (kontekst, nastavi) => {
            if (!this.idJeviAdministratora.includes(kontekst.from?.id ?? NULA)) {
                console.log({ dogadjaj: 'Neovlašćen pristup' })
                await kontekst.reply('Ovo je Crna Gora, ođe se ne radi \u{1F61C}')
                return
            }

            await nastavi()
        })

        this.bot.command('start', async kontekst => {
            await kontekst.reply(`Ćao ${kontekst.from?.first_name}! Ovo je Crna Gora, ođe se ne radi \u{1F61C}`)
        })

        this.bot.command('stats', async kontekst => {
            await this.pokretacPoslova.pokreni({ vrsta: 'statistika', odgovor: odgovorNaKomandu(kontekst) })
        })

        this.bot.command('motivate', async kontekst => {
            await this.pokretacPoslova.pokreni({ vrsta: 'motivacija', odgovor: odgovorNaKomandu(kontekst) })
        })

        this.bot.command('poop', async kontekst => {
            await kontekst.react('\u{1F4A9}')
        })
    }
}

function odgovorNaKomandu(kontekst: KontekstKomande<Kontekst>): OdgovorNaKomandu {
    return async tekst =>
        await kontekst.reply(tekst, {
            message_thread_id: kontekst.message?.message_thread_id,
        })
}
