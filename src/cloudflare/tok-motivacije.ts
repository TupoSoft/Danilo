import {
    WorkflowEntrypoint as TokRada,
    type WorkflowEvent as DogadjajToka,
    type WorkflowStep as KorakToka,
} from 'cloudflare:workers'
import { NULA } from '../konstante.js'
import type { IshodIsporuke, IshodPripreme } from '../poslovi.js'
import { parsirajMotivacioniPosao, type MotivacioniPosao } from './ugovor-posla.js'
import { napraviGeneratorMotivacije, napraviTelegramIsporuku } from './zavisnosti.js'
import { NAJVISE_PONAVLJANJA, odlaganjeIsporuke, pokusajIsporuku } from './isporuka-toka.js'
import type { Okruzenje } from './tipovi.js'

export class TokMotivacije extends TokRada<Okruzenje, MotivacioniPosao> {
    override async run(
        { payload: sadrzaj }: DogadjajToka<MotivacioniPosao>,
        koraci: KorakToka,
    ): Promise<IshodIsporuke> {
        const { env: okruzenje } = this
        const posao = parsirajMotivacioniPosao(sadrzaj)

        const priprema = await koraci
            .do<Extract<IshodPripreme, { vrsta: 'poruka' }>>(
                'priprema-poruke',
                { retries: { limit: NULA, delay: '1 second' }, timeout: '30 minutes' },
                async () => ({ vrsta: 'poruka', tekst: await napraviGeneratorMotivacije(okruzenje).generisi() }),
            )
            .catch(() => {
                console.error({ dogadjaj: 'Neuspjela priprema poruke', vrsta: 'motivacija' })
                throw new Error('Priprema poruke nije uspjela.')
            })

        return await koraci.do(
            'isporuka-poruke',
            {
                retries: { limit: NAJVISE_PONAVLJANJA, delay: odlaganjeIsporuke, backoff: 'constant' },
                timeout: '30 seconds',
            },
            async ({ attempt: pokusaj }) =>
                await pokusajIsporuku(posao.odrediste, priprema.tekst, pokusaj, napraviTelegramIsporuku(okruzenje)),
        )
    }
}
