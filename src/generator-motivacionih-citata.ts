import type { OpenAI as OpenAIKlijent } from 'openai'
import SISTEMSKO_UPUTSTVO_MOTIVACIONOG_CITATA from './uputstva/motivacioni-citat.md?raw'

export class GeneratorMotivacionihCitata {
    private static readonly MODEL = 'gpt-5'
    private static readonly KORISNICKO_UPUTSTVO = 'Napiši kratku motivacionu poruku za ekipu.'
    private static readonly REZERVNI_CITAT = 'Rad je stvoren za konje, a ne za ljude.'
    private static readonly PORUKA_GRESKE = 'Greška prilikom generisanja citata:'
    private static readonly ODGOVOR_PRI_GRESCI = 'Ođe se ne radi.'

    constructor(private readonly openaiKlijent: OpenAIKlijent) {}

    async generisi(): Promise<string> {
        try {
            return await this.dohvatiCitat()
        } catch {
            console.error({ dogadjaj: 'motivacija-nedostupna', poruka: GeneratorMotivacionihCitata.PORUKA_GRESKE })
            return GeneratorMotivacionihCitata.ODGOVOR_PRI_GRESCI
        }
    }

    private async dohvatiCitat(): Promise<string> {
        const {
            choices: [
                {
                    message: { content: sadrzaj },
                },
            ],
        } = await this.openaiKlijent.chat.completions.create({
            model: GeneratorMotivacionihCitata.MODEL,
            messages: [
                {
                    role: 'system',
                    content: SISTEMSKO_UPUTSTVO_MOTIVACIONOG_CITATA,
                },
                {
                    role: 'user',
                    content: GeneratorMotivacionihCitata.KORISNICKO_UPUTSTVO,
                },
            ],
        })

        return sadrzaj ?? GeneratorMotivacionihCitata.REZERVNI_CITAT
    }
}
