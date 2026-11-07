import type { OpenAI as OpenAIKlijent } from 'openai'
import SISTEMSKO_UPUTSTVO_DNEVNOG_PREGLEDA from './uputstva/dnevni-pregled.md?raw'
import { NULA, VREMENSKA_ZONA_IZVJESTAJA } from './konstante.js'
import type { OpsegDnevnogPregleda } from './priprema-statistike.js'

const NAJVISE_ZNAKOVA_PREGLEDA = 4_000
const NAJVISE_POZIVA_ALATA = 128
const NAJVISE_TOKENA_ODGOVORA = 24_000
const NAZIV_ORGANIZACIJE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/

export class GeneratorDnevnogPregleda {
    constructor(
        private readonly openaiKlijent: OpenAIKlijent,
        private readonly organizacija: string,
        private readonly githubToken: string,
    ) {}

    async napisi(opseg: OpsegDnevnogPregleda): Promise<string> {
        if (!NAZIV_ORGANIZACIJE.test(this.organizacija)) {
            throw new Error('Naziv GitHub organizacije nije ispravan.')
        }

        const odgovor = await this.openaiKlijent.responses.create({
            model: 'gpt-5',
            reasoning: { effort: 'low' },
            store: false,
            max_tool_calls: NAJVISE_POZIVA_ALATA,
            max_output_tokens: NAJVISE_TOKENA_ODGOVORA,
            tools: [
                {
                    type: 'mcp',
                    server_label: 'github',
                    server_url: 'https://api.githubcopilot.com/mcp/readonly',
                    authorization: this.githubToken,
                    require_approval: 'never',
                    allowed_tools: [
                        'search_repositories',
                        'list_branches',
                        'list_commits',
                        'get_commit',
                        'pull_request_read',
                    ],
                },
            ],
            instructions: SISTEMSKO_UPUTSTVO_DNEVNOG_PREGLEDA,
            input: JSON.stringify({
                organizacija: this.organizacija,
                upitRepozitorijuma: `org:${this.organizacija} fork:true`,
                od: opseg.od,
                doTrenutka: opseg.doTrenutka,
                vremenskaZona: VREMENSKA_ZONA_IZVJESTAJA,
            }),
        })

        if (odgovor.status !== 'completed' || odgovor.error !== null || odgovor.incomplete_details !== null) {
            throw new Error('Dnevni pregled nije završen.')
        }

        let brojPoziva = NULA
        let tekstOdgovora: string | undefined = undefined
        let oznacenKonacniOdgovor = false

        for (const stavka of odgovor.output) {
            if (stavka.type === 'mcp_approval_request') {
                throw new Error('Dnevni pregled zahtijeva dodatno odobrenje alata.')
            }

            if (stavka.type === 'mcp_list_tools' && stavka.error !== null && stavka.error !== undefined) {
                throw new Error('GitHub MCP alati trenutno nijesu dostupni.')
            }

            if (stavka.type === 'mcp_call') {
                if (
                    (stavka.error !== null && stavka.error !== undefined) ||
                    stavka.output === null ||
                    stavka.output === undefined ||
                    (stavka.status !== undefined && stavka.status !== 'completed')
                ) {
                    throw new Error('GitHub MCP poziv nije uspješno završen.')
                }

                brojPoziva++
                tekstOdgovora = undefined
                oznacenKonacniOdgovor = false
            }

            if (stavka.type === 'message') {
                if (stavka.status !== 'completed') throw new Error('Tekst dnevnog pregleda nije završen.')

                const djelovi: string[] = []
                for (const sadrzaj of stavka.content) {
                    if (sadrzaj.type === 'refusal') throw new Error('Dnevni pregled nije pripremljen.')
                    djelovi.push(sadrzaj.text)
                }

                if (stavka.phase === 'final_answer') {
                    tekstOdgovora = djelovi.join('\n')
                    oznacenKonacniOdgovor = true
                } else if (stavka.phase !== 'commentary' && !oznacenKonacniOdgovor) {
                    tekstOdgovora = djelovi.join('\n')
                }
            }
        }

        if (brojPoziva === NULA || brojPoziva > NAJVISE_POZIVA_ALATA) {
            throw new Error('Dnevni pregled nema GitHub podatke ili premašuje dozvoljen broj poziva.')
        }

        const tekst = tekstOdgovora?.trim() ?? ''
        if (tekst.length === NULA || tekst.length > NAJVISE_ZNAKOVA_PREGLEDA) {
            throw new Error('Dnevni pregled nije prikladan za slanje.')
        }

        return tekst
    }
}
