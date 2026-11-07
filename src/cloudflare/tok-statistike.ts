import {
    WorkflowEntrypoint as TokRada,
    type WorkflowEvent as DogadjajToka,
    type WorkflowStep as KorakToka,
} from 'cloudflare:workers'
import { NULA } from '../konstante.js'
import type { IshodIsporuke, IshodPripreme } from '../poslovi.js'
import { parsirajStatistickiPosao, type StatistickiPosao } from './ugovor-posla.js'
import { napraviPripremuStatistike, napraviTelegramIsporuku } from './zavisnosti.js'
import { NAJVISE_PONAVLJANJA, odlaganjeIsporuke, pokusajIsporuku } from './isporuka-toka.js'
import type { Okruzenje } from './tipovi.js'

export class TokStatistike extends TokRada<Okruzenje, StatistickiPosao> {
    override async run(
        { payload: sadrzaj }: DogadjajToka<StatistickiPosao>,
        koraci: KorakToka,
    ): Promise<IshodIsporuke> {
        const { env: okruzenje } = this
        const posao = parsirajStatistickiPosao(sadrzaj)
        const priprema = await koraci
            .do(
                'priprema-poruke',
                { retries: { limit: NULA, delay: '1 second' }, timeout: '30 minutes' },
                async () => await napraviPripremuStatistike(okruzenje).pripremi(new Date(posao.trenutakIzvjestaja)),
            )
            .catch((): IshodPripreme => {
                // I pri isteku koraka statistika zadržava ručni odgovor i zakazano preskakanje.
                console.error({ dogadjaj: 'Neuspjela priprema poruke', vrsta: 'statistika' })
                return { vrsta: 'preskoceno', razlog: 'statistika-nedostupna' }
            })

        if (priprema.vrsta === 'preskoceno' && posao.izvor === 'zakazani') return priprema

        const tekst =
            priprema.vrsta === 'poruka' ? priprema.tekst : 'Statistika trenutno nije dostupna. Pokušaj ponovo kasnije.'

        return await koraci.do(
            'isporuka-poruke',
            {
                retries: { limit: NAJVISE_PONAVLJANJA, delay: odlaganjeIsporuke, backoff: 'constant' },
                timeout: '30 seconds',
            },
            async ({ attempt: pokusaj }) =>
                await pokusajIsporuku(posao.odrediste, tekst, pokusaj, napraviTelegramIsporuku(okruzenje)),
        )
    }
}
